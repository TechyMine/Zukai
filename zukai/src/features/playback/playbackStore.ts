/**
 * ZUKAI AUDIO PLAYBACK STORE
 * Location: /zukai/src/features/playback/playbackStore.ts
 * Description: Global Zustand audio player engine backed by modern expo-audio,
 *              supporting background audio, playback speed, chapter seeking,
 *              karaoke transcript tracking, and throttled Supabase progress sync.
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
  updatePlaybackProgress,
  fetchPlaybackProgress,
} from './api/playbackApi';
import { getLocalAudioUri } from './downloadManager';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface PlaybackState {
  // Track metadata
  activeTrack: AudioTrackRow | null;
  documentTitle: string;
  chapters: ChapterRow[];
  transcript: TranscriptRow | null;
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
let lastSyncTimestamp = 0;
let sleepTimerInterval: any = null;

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  activeTrack: null,
  documentTitle: 'Audio Lesson',
  chapters: [],
  transcript: null,
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
      const [signedAudioUrl, chapters, transcript, savedProgress] = await Promise.all([
        localUri ? Promise.resolve(localUri) : getSignedAudioUrl(track.storage_path),
        fetchChapters(track.id).catch(() => [] as ChapterRow[]),
        fetchTranscript(track.id).catch(() => null),
        fetchPlaybackProgress(track.id).catch(() => null),
      ]);
      const effectiveAudioUri = localUri || signedAudioUrl;

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

          // Compute active sentence index from transcript segments
          let sentenceIdx = 0;
          const transcriptData = get().transcript;
          if (transcriptData && Array.isArray(transcriptData.segments)) {
            const segs = transcriptData.segments as Array<{ start_ms: number; end_ms: number }>;
            for (let i = 0; i < segs.length; i++) {
              if (pos >= segs[i].start_ms && pos <= segs[i].end_ms) {
                sentenceIdx = i;
                break;
              } else if (pos < segs[i].start_ms) {
                sentenceIdx = Math.max(0, i - 1);
                break;
              }
            }
          }

          set({
            positionMs: pos,
            durationMs: dur,
            isPlaying: playing,
            isBuffering: buffering,
            hasEnded: finished,
            activeChapterIndex: chapterIdx,
            activeSentenceIndex: sentenceIdx,
          });

          // Throttled persistence (save every 5 seconds or upon finishing)
          const now = Date.now();
          if (finished || now - lastSyncTimestamp > 5000) {
            lastSyncTimestamp = now;
            updatePlaybackProgress({
              trackId: track.id,
              positionSeconds: Math.floor(pos / 1000),
              speed: currentSpeed,
              completed: finished,
            }).catch((syncErr) => {
              logger.warn('[AudioPlayer] Failed to sync progress:', syncErr);
            });
          }
        });

        // Start playback
        currentPlayer.play();

        set({
          signedUrl: effectiveAudioUri,
          chapters,
          transcript,
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
    const { transcript } = get();
    if (transcript && Array.isArray(transcript.segments)) {
      const segs = transcript.segments as Array<{ start_ms: number }>;
      if (segs[sentenceIndex]) {
        await get().seekTo(segs[sentenceIndex].start_ms);
        set({ activeSentenceIndex: sentenceIndex });
      }
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
      set({ sleepTimerMinutes: null, sleepTimerRemainingSec: null });
      return;
    }

    const totalSeconds = Math.round(minutes * 60);
    set({ sleepTimerMinutes: minutes, sleepTimerRemainingSec: totalSeconds });

    sleepTimerInterval = setInterval(() => {
      const remaining = get().sleepTimerRemainingSec;
      if (remaining === null || remaining <= 1) {
        clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
        set({ sleepTimerMinutes: null, sleepTimerRemainingSec: null });
        get().togglePlayPause(); // Auto-pause audio on sleep timer expiration
      } else {
        set({ sleepTimerRemainingSec: remaining - 1 });
      }
    }, 1000);
  },

  saveBookmark: async (note?: string) => {
    const { activeTrack, positionMs } = get();
    if (!activeTrack) return { success: false, error: 'No active track' };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return { success: false, error: 'Not authenticated' };

      const { error } = await supabase.from('bookmarks').insert({
        user_id: userId,
        track_id: activeTrack.id,
        position_seconds: Math.round(positionMs / 1000),
        note: note?.trim() || null,
      });

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      logger.warn('[AudioPlayer] Failed to save bookmark:', err?.message);
      return { success: false, error: err?.message };
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
