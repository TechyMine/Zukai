/**
 * ZUKAI — Offline Downloads Screen
 * Location: /zukai/src/app/downloads.tsx
 * Lists locally cached MP3 audio tracks for offline playback,
 * shows file sizes and storage metrics, and supports play and deletion.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  HardDrive,
  Trash2,
  Play,
  FileAudio,
  Clock,
  Sparkles,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { Text } from '@/components/Text';
import { ShinyButton } from '@/components/ShinyButton';
import { EmptyState } from '@/components/EmptyState';
import {
  getDownloadsIndex,
  getStorageUsage,
  deleteDownloadedTrack,
  clearAllDownloads,
  DownloadedTrackMeta,
} from '@/features/playback/downloadManager';
import { usePlaybackStore } from '@/features/playback/playbackStore';

const C = {
  brandHero: '#8EF20F',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textInverse: '#09161B',
  error: '#FF5252',
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function DownloadsScreen() {
  const router = useRouter();
  const { playTrack } = usePlaybackStore();

  const [isLoading, setIsLoading] = useState(true);
  const [downloads, setDownloads] = useState<DownloadedTrackMeta[]>([]);
  const [storageUsage, setStorageUsage] = useState({ totalBytes: 0, formatted: '0 B', count: 0 });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [index, usage] = await Promise.all([
        getDownloadsIndex(),
        getStorageUsage(),
      ]);
      setDownloads(Object.values(index));
      setStorageUsage(usage);
    } catch (err) {
      console.warn('Failed to load downloads:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePlayOffline = (item: DownloadedTrackMeta) => {
    playTrack(
      {
        id: item.trackId,
        duration_seconds: item.durationSeconds,
        format: item.format,
        storage_path: item.localAudioUri,
      } as any,
      item.documentTitle
    );
    router.push('/player' as any);
  };

  const handleDeleteItem = (item: DownloadedTrackMeta) => {
    Alert.alert(
      'Remove Download',
      `Delete "${item.documentTitle}" from offline storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDownloadedTrack(item.trackId);
            await loadData();
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (downloads.length === 0) return;
    Alert.alert(
      'Clear All Downloads',
      `Delete all ${downloads.length} offline tracks from your device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            await clearAllDownloads();
            await loadData();
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer meshVariant="home" hasTabBar={false}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color={C.textSecondary} strokeWidth={2} />
        </Pressable>
        <Text variant="headline" rawColor={C.textPrimary} style={{ fontWeight: '800' }}>
          Offline Downloads
        </Text>
        {downloads.length > 0 ? (
          <Pressable onPress={handleClearAll} hitSlop={8} style={styles.clearBtn}>
            <Text variant="caption" rawColor={C.error} style={{ fontWeight: '700' }}>
              Clear All
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Storage Summary Card */}
      <GlassCard style={styles.summaryCard} padding={12} borderRadius={16}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryIconBox}>
            <HardDrive size={18} color={C.brandHero} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="subhead" rawColor={C.textPrimary} style={{ fontWeight: '700' }}>
              Device Storage
            </Text>
            <Text variant="caption" rawColor={C.textTertiary}>
              {storageUsage.formatted} used across {storageUsage.count} offline track{storageUsage.count !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </GlassCard>

      {/* Loading */}
      {isLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={C.brandHero} />
          <Text variant="subhead" rawColor={C.textSecondary} style={{ marginTop: 8 }}>
            Checking offline files...
          </Text>
        </View>
      )}

      {/* Empty State */}
      {!isLoading && downloads.length === 0 && (
        <EmptyState
          pose="listening"
          title="No Offline Tracks"
          message="Download your audio explanations in Library to listen offline without internet connection."
          actionLabel="Open Library"
          onAction={() => router.push('/(tabs)/library')}
        />
      )}

      {/* Tracks List */}
      {!isLoading && downloads.length > 0 && (
        <View style={styles.list}>
          {downloads.map((item) => {
            const sizeMb = (item.fileSizeBytes / (1024 * 1024)).toFixed(1);

            return (
              <GlassCard
                key={item.trackId}
                style={styles.trackCard}
                padding={10}
                borderRadius={14}
              >
                <View style={styles.trackRow}>
                  <View style={styles.trackIconBox}>
                    <FileAudio size={18} color={C.brandHero} strokeWidth={2.2} />
                  </View>
                  <View style={styles.trackInfo}>
                    <Text
                      variant="subhead"
                      rawColor={C.textPrimary}
                      numberOfLines={1}
                      style={{ fontWeight: '700' }}
                    >
                      {item.documentTitle}
                    </Text>
                    <View style={styles.trackMeta}>
                      <Clock size={11} color={C.textTertiary} />
                      <Text variant="caption" rawColor={C.textTertiary} style={{ marginLeft: 4 }}>
                        {formatDuration(item.durationSeconds)} • {sizeMb} MB • MP3
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.actionRow}>
                    <Pressable
                      style={styles.playBtn}
                      onPress={() => handlePlayOffline(item)}
                    >
                      <Play size={14} color={C.textInverse} strokeWidth={2.5} />
                    </Pressable>
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteItem(item)}
                      hitSlop={8}
                    >
                      <Trash2 size={16} color={C.error} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>
              </GlassCard>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  summaryCard: {
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: 8,
  },
  trackCard: {
    marginBottom: 2,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  trackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8EF20F',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#63B300',
  },
  deleteBtn: {
    padding: 6,
  },
});
