/**
 * ZUKAI PLAYBACK PROGRESS SYNC & OFFLINE QUEUE
 * Location: /zukai/src/features/playback/progressSync.ts
 *
 * Implements:
 * 1. Stable client device ID persistence
 * 2. 5-second throttled progress synchronization to Supabase
 * 3. Stale-write rejection with client timestamps (client_ts)
 * 4. Offline queue in AsyncStorage that flushes when connectivity resumes
 * 5. Incremental listening time reporting to listening_daily
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { updatePlaybackProgress, addListeningSeconds } from './api/playbackApi';
import { logger } from '@/lib/logger';

const DEVICE_ID_KEY = '@zukai_device_id_v1';
const OFFLINE_QUEUE_KEY = '@zukai_offline_progress_queue_v1';
const SYNC_THROTTLE_MS = 5000;

let cachedDeviceId: string | null = null;
let lastSyncTimestamp = 0;
let lastSyncedPositionSec = 0;

export function _resetCachedDeviceIdForTesting(): void {
  cachedDeviceId = null;
  lastSyncTimestamp = 0;
  lastSyncedPositionSec = 0;
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }

    // Generate random stable device identifier
    const randPart = Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36);
    const newId = `dev_${timePart}_${randPart}`;

    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
    cachedDeviceId = newId;
    return newId;
  } catch (err) {
    logger.warn('[ProgressSync] Failed to access AsyncStorage for deviceId:', err);
    return 'dev_fallback_id';
  }
}

interface QueuedProgressEntry {
  trackId: string;
  positionSeconds: number;
  speed: number;
  completed: boolean;
  deviceId: string;
  clientTs: string;
}

/**
 * Attempts to flush any pending offline progress sync records.
 */
export async function flushOfflineProgressQueue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return;

    const queue: QueuedProgressEntry[] = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return;

    const remaining: QueuedProgressEntry[] = [];

    for (const entry of queue) {
      try {
        await updatePlaybackProgress({
          trackId: entry.trackId,
          positionSeconds: entry.positionSeconds,
          speed: entry.speed,
          completed: entry.completed,
          deviceId: entry.deviceId,
          clientTs: entry.clientTs,
        });
      } catch (err) {
        // If still failing (e.g. offline), retain entry
        remaining.push(entry);
      }
    }

    if (remaining.length > 0) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    } else {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    }
  } catch (err) {
    logger.warn('[ProgressSync] Error flushing offline progress queue:', err);
  }
}

export interface SyncProgressOptions {
  trackId: string;
  positionSeconds: number;
  speed: number;
  completed: boolean;
  forceImmediate?: boolean;
}

/**
 * Synchronizes playback progress with 5-second throttling and offline queue fallback.
 */
export async function syncProgress(options: SyncProgressOptions): Promise<void> {
  const now = Date.now();
  const isImmediate = options.forceImmediate || options.completed;

  if (!isImmediate && now - lastSyncTimestamp < SYNC_THROTTLE_MS) {
    return;
  }

  const deviceId = await getOrCreateDeviceId();
  const clientTs = new Date().toISOString();

  // Calculate elapsed listening seconds since last sync for listening_daily
  const deltaSec = Math.max(0, Math.round(options.positionSeconds - lastSyncedPositionSec));
  lastSyncTimestamp = now;
  lastSyncedPositionSec = options.positionSeconds;

  try {
    // 1. Flush any queued offline writes
    await flushOfflineProgressQueue();

    // 2. Perform live update
    await updatePlaybackProgress({
      trackId: options.trackId,
      positionSeconds: options.positionSeconds,
      speed: options.speed,
      completed: options.completed,
      deviceId,
      clientTs,
    });

    // 3. Record listening seconds if legitimate progress occurred
    if (deltaSec > 0 && deltaSec <= 300) {
      addListeningSeconds(deltaSec).catch(() => {});
    }
  } catch (err) {
    logger.warn('[ProgressSync] Network call failed, queuing progress offline:', err);

    try {
      const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue: QueuedProgressEntry[] = raw ? JSON.parse(raw) : [];

      // Replace or append for this track
      const filtered = queue.filter((item) => item.trackId !== options.trackId);
      filtered.push({
        trackId: options.trackId,
        positionSeconds: options.positionSeconds,
        speed: options.speed,
        completed: options.completed,
        deviceId,
        clientTs,
      });

      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
    } catch (queueErr) {
      logger.error('[ProgressSync] Failed to store offline progress queue:', queueErr);
    }
  }
}
