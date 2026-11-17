/**
 * ZUKAI AUDIO PLAYBACK STORE
 * Location: /zukai/src/features/playback/playbackStore.ts
 * Description: Global Zustand audio player engine backed by modern expo-audio,
 *              supporting background audio, playback speed, chapter seeking,
 *              O(log n) binary-search transcript sync, wall-clock sleep timer,
 *              and throttled offline-queue Supabase progress sync.
 */

import { create } from 'zustand';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import {
  AudioTrackRow,
  ChapterRow,
  TranscriptRow,
  fetchChapters,
  fetchTranscript,
  getSignedAudioUrl,
} from '@/features/tracks/api/tracksApi';
import {
  fetchPlaybackProgress,
  createBookmark,
  requestAudioUrl,
} from './api/playbackApi';
import { syncProgress } from './progressSync';
import {
  parseTranscriptSegments,
  findActiveSentenceIndex,
  type TranscriptSegment,
} from './hooks/useTranscript';
import { getLocalAudioUri } from './downloadManager';
import { logger } from '@/lib/logger';

export interface PlaybackState {
  // Track metadata
  activeTrack: AudioTrackRow | null;
  documentTitle: string;
  chapters: ChapterRow[];
  transcript: TranscriptRow | null;
  parsedSegments: TranscriptSegment[];
  signedUrl: string | null;

  // Real-time playback status
  isPlaying: boolean;
  isBuffering: boolean;
  positionMs: number;
  durationMs: number;
  speed: number;
  hasEnded: boolean;
  isRepeat: boolean;

  // Sleep timer
  sleepTimerMinutes: number | null;
  sleepTimerRemainingSec: number | null;
  sleepTimerDeadline: number | null;

  // Active chapter and sentence
  activeChapterIndex: number;
  activeSentenceIndex: number;

  // Actions
  playTrack: (track: AudioTrackRow, title?: string) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  skipBy: (deltaSeconds: number) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  jumpToChapter: (chapterIndex: number) => Promise<void>;
  seekToSentence: (sentenceIndex: number) => Promise<void>;
  toggleRepeat: () => void;
  setSleepTimer: (minutes: number | null) => void;
  saveBookmark: (note?: string) => Promise<{ success: boolean; error?: string }>;
  stop: () => Promise<void>;
}

// Global reference to the single AudioPlayer instance
let currentPlayer: AudioPlayer | null = null;
let sleepTimerInterval: ReturnType<typeof setInterval> | null = null;

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  activeTrack: null,
  documentTitle: 'Audio Lesson',
  chapters: [],
  transcript: null,
  parsedSegments: [],
  signedUrl: null,

  isPlaying: false,
  isBuffering: false,
  positionMs: 0,
  durationMs: 0,
  speed: 1.0,
  hasEnded: false,
  isRepeat: false,
  sleepTimerMinutes: null,
  sleepTimerRemainingSec: null,
  sleepTimerDeadline: null,

  activeChapterIndex: 0,
  activeSentenceIndex: 0,

  playTrack: async (track: AudioTrackRow, title?: string) => {
    try {
      // 1. Configure audio mode for background playback
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'mixWithOthers',
        });
      } catch (e) {
        logger.warn('[AudioPlayer] setAudioModeAsync warning:', e);
      }

      // 2. Release existing player if any
      if (currentPlayer) {
        try {
          currentPlayer.pause();
          if (typeof (currentPlayer as any).remove === 'function') {
            (currentPlayer as any).remove();
          } else if (typeof (currentPlayer as any).release === 'function') {
            (currentPlayer as any).release();
          }
        } catch {}
        currentPlayer = null;
      }

      set({
        activeTrack: track,
        documentTitle: title || 'Audio Lesson',
        isBuffering: true,
        isPlaying: false,
        positionMs: 0,
        hasEnded: false,
      });

      // 3. Concurrently fetch audio URI (offline first!), chapters, and transcript
      const localUri = await getLocalAudioUri(track.id).catch(() => null);

      const resolveAudioUri = async (): Promise<string> => {
        if (localUri) return localUri;
        try {
          const storagePath = await requestAudioUrl(track.id, 'stream');
          return await getSignedAudioUrl(storagePath || track.storage_path);
        } catch {
          return await getSignedAudioUrl(track.storage_path);
        }
      };

      const [effectiveAudioUri, chapters, transcript, savedProgress] = await Promise.all([
        resolveAudioUri(),
        fetchChapters(track.id).catch(() => [] as ChapterRow[]),
        fetchTranscript(track.id).catch(() => null),
        fetchPlaybackProgress(track.id).catch(() => null),
      ]);

      const parsedSegments = parseTranscriptSegments(transcript);

      const initialPositionMs =
        savedProgress && savedProgress.position_seconds > 0 && !savedProgress.completed
          ? Math.floor(savedProgress.position_seconds * 1000)
          : 0;

      const currentSpeed = savedProgress?.speed || get().speed || 1.0;

      // 4. Instantiate modern AudioPlayer
      let playerInstance: AudioPlayer | null = null;
      try {
        playerInstance = createAudioPlayer(
          { uri: effectiveAudioUri },
          { updateInterval: 200 }
        );
      } catch (err) {
        logger.warn('[AudioPlayer] Failed to instantiate native AudioPlayer, using state fallback:', err);
      }

      if (playerInstance) {
        currentPlayer = playerInstance;
        currentPlayer.loop = get().isRepeat;
        if (currentSpeed !== 1.0) {
          currentPlayer.playbackRate = currentSpeed;
        }

        if (initialPositionMs > 0) {
          try {
            await currentPlayer.seekTo(initialPositionMs / 1000);
          } catch {}
        }

        currentPlayer.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if (!status.isLoaded) return;

          const pos = Math.round((status.currentTime || 0) * 1000);
          const dur = Math.round((status.duration || track.duration_seconds || 0) * 1000);
          const playing = Boolean(status.playing);
          const buffering = Boolean(status.isBuffering);
          const finished = Boolean(status.didJustFinish);

          // Handle repeat
          if (finished && get().isRepeat && currentPlayer) {
            currentPlayer.seekTo(0).then(() => currentPlayer?.play()).catch(() => {});
            return;
          }

          // Compute active chapter index
          const allChapters = get().chapters;
          let chapterIdx = 0;
          if (allChapters.length > 0) {
            for (let i = allChapters.length - 1; i >= 0; i--) {
              if (pos / 1000 >= allChapters[i].start_seconds) {
                chapterIdx = i;
                break;
              }
            }
          }

          // Compute active sentence index using O(log n) binary search
          const segments = get().parsedSegments;
          const sentenceIdx = findActiveSentenceIndex(segments, pos / 1000);

          set({
            positionMs: pos,
            durationMs: dur,
            isPlaying: playing,
            isBuffering: buffering,
            hasEnded: finished,
            activeChapterIndex: chapterIdx,
            activeSentenceIndex: sentenceIdx,
          });

          // Throttled persistence (5s interval or upon completion)
          syncProgress({
            trackId: track.id,
            positionSeconds: Math.floor(pos / 1000),
            speed: currentSpeed,
            completed: finished,
          }).catch((syncErr) => {
            logger.warn('[AudioPlayer] Failed to sync progress:', syncErr);
          });
        });

        // Start playback
        currentPlayer.play();

        set({
          signedUrl: effectiveAudioUri,
          chapters,
          transcript,
          parsedSegments,
          speed: currentSpeed,
          isBuffering: false,
          isPlaying: true,
          durationMs: track.duration_seconds * 1000,
        });
      } else {
        // Fallback for non-native test environments
        set({
          signedUrl: effectiveAudioUri,
          chapters,
          transcript,
          parsedSegments,
          speed: currentSpeed,
          isBuffering: false,
          isPlaying: true,
          durationMs: track.duration_seconds * 1000,
        });
      }
    } catch (err) {
      logger.error('[AudioPlayer] Failed to play track:', err);
      set({ isBuffering: false, isPlaying: false });
    }
  },

  togglePlayPause: async () => {
    const { isPlaying } = get();
    if (currentPlayer) {
      try {
        if (isPlaying) {
          currentPlayer.pause();
          set({ isPlaying: false });
        } else {
          currentPlayer.play();
          set({ isPlaying: true });
        }
      } catch (err) {
        logger.error('[AudioPlayer] togglePlayPause failed:', err);
      }
    } else {
      set({ isPlaying: !isPlaying });
    }
  },

  seekTo: async (positionMs: number) => {
    const clamped = Math.max(0, Math.min(positionMs, get().durationMs));
    set({ positionMs: clamped });
    if (currentPlayer) {
      try {
        await currentPlayer.seekTo(clamped / 1000);
      } catch (err) {
        logger.error('[AudioPlayer] seekTo failed:', err);
      }
    }
  },

  skipBy: async (deltaSeconds: number) => {
    const { positionMs, durationMs } = get();
    const newPos = positionMs + deltaSeconds * 1000;
    const clamped = Math.max(0, Math.min(newPos, durationMs));
    await get().seekTo(clamped);
  },

  setSpeed: async (speed: number) => {
    set({ speed });
    if (currentPlayer) {
      try {
        currentPlayer.playbackRate = speed;
      } catch (err) {
        logger.error('[AudioPlayer] setSpeed failed:', err);
      }
    }
  },

  jumpToChapter: async (chapterIndex: number) => {
    const { chapters } = get();
    if (chapterIndex >= 0 && chapterIndex < chapters.length) {
      const targetSec = chapters[chapterIndex].start_seconds;
      await get().seekTo(targetSec * 1000);
      set({ activeChapterIndex: chapterIndex });
    }
  },

  seekToSentence: async (sentenceIndex: number) => {
    const { parsedSegments } = get();
    if (parsedSegments[sentenceIndex]) {
      await get().seekTo(parsedSegments[sentenceIndex].start_seconds * 1000);
      set({ activeSentenceIndex: sentenceIndex });
    }
  },

  toggleRepeat: () => {
    const nextRepeat = !get().isRepeat;
    set({ isRepeat: nextRepeat });
    if (currentPlayer) {
      currentPlayer.loop = nextRepeat;
    }
  },

  setSleepTimer: (minutes: number | null) => {
    if (sleepTimerInterval) {
      clearInterval(sleepTimerInterval);
      sleepTimerInterval = null;
    }

    if (minutes === null || minutes <= 0) {
      set({ sleepTimerMinutes: null, sleepTimerRemainingSec: null, sleepTimerDeadline: null });
      return;
    }

    const totalSeconds = Math.round(minutes * 60);
    const deadline = Date.now() + totalSeconds * 1000;

    set({
      sleepTimerMinutes: minutes,
      sleepTimerRemainingSec: totalSeconds,
      sleepTimerDeadline: deadline,
    });

    sleepTimerInterval = setInterval(() => {
      const { sleepTimerDeadline } = get();
      if (!sleepTimerDeadline) {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        return;
      }

      const remainingSec = Math.max(0, Math.round((sleepTimerDeadline - Date.now()) / 1000));

      if (remainingSec <= 0) {
        if (sleepTimerInterval) clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
        set({ sleepTimerMinutes: null, sleepTimerRemainingSec: null, sleepTimerDeadline: null });
        get().togglePlayPause(); // Pause audio on expiration
      } else {
        set({ sleepTimerRemainingSec: remainingSec });
      }
    }, 1000);
  },

  saveBookmark: async (note?: string) => {
    const { activeTrack, positionMs } = get();
    if (!activeTrack) return { success: false, error: 'No active track' };

    try {
      await createBookmark(activeTrack.id, Math.round(positionMs / 1000), note?.trim() || undefined);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[AudioPlayer] Failed to save bookmark:', msg);
      return { success: false, error: msg };
    }
  },

  stop: async () => {
    if (currentPlayer) {
      try {
        currentPlayer.pause();
        if (typeof (currentPlayer as any).remove === 'function') {
          (currentPlayer as any).remove();
        } else if (typeof (currentPlayer as any).release === 'function') {
          (currentPlayer as any).release();
        }
      } catch {}
      currentPlayer = null;
    }
    set({
      isPlaying: false,
      positionMs: 0,
      activeTrack: null,
      signedUrl: null,
    });
  },
}));
