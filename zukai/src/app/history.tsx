/**
 * ZUKAI — Listening History Screen
 * Location: /zukai/src/app/history.tsx
 * Lists recently listened tracks grouped by Today, Yesterday, and Earlier
 * with exact playback progress and quick "Resume / Play Again" actions.
 */

import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  Headphones,
  RotateCcw,
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { Text } from '@/components/Text';
import { ShinyButton } from '@/components/ShinyButton';
import { ProgressBar } from '@/components/ProgressBar';
import { EmptyState } from '@/components/EmptyState';
import { usePlaybackStore } from '@/features/playback/playbackStore';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';

const C = {
  brandHero: '#8EF20F',
  canvasSurfaceRaised: '#132830',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textInverse: '#09161B',
  success: '#00E676',
};

interface HistoryItem {
  track_id: string;
  position_seconds: number;
  completed: boolean;
  updated_at: string;
  track: {
    id: string;
    duration_seconds: number;
    format: string;
    storage_path: string;
    document_id: string;
    document?: {
      id: string;
      title: string;
      original_filename: string;
    };
  };
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const { playTrack } = usePlaybackStore();
  const userId = useAuthStore((s) => s.user?.id);

  const { data: history = [], isLoading, refetch } = useQuery<HistoryItem[]>({
    queryKey: ['playback-history', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playback_progress')
        .select(`
          track_id,
          position_seconds,
          completed,
          updated_at,
          track:audio_tracks (
            id,
            duration_seconds,
            format,
            storage_path,
            document_id,
            document:documents (
              id,
              title,
              original_filename
            )
          )
        `)
        .eq('user_id', userId!)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 10000,
  });

  // Group items by Today, Yesterday, and Earlier
  const groupedHistory = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const groups: { [key: string]: HistoryItem[] } = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    for (const item of history) {
      if (!item.track || !item.track.document) continue;
      const d = new Date(item.updated_at);
      const itemDateStr = d.toDateString();

      if (itemDateStr === todayStr) {
        groups.Today.push(item);
      } else if (itemDateStr === yesterdayStr) {
        groups.Yesterday.push(item);
      } else {
        groups.Earlier.push(item);
      }
    }

    return groups;
  }, [history]);

  const handlePlayAgain = (item: HistoryItem) => {
    if (!item.track || !item.track.document) return;
    playTrack(item.track as any, item.track.document.title);
    router.push('/player' as any);
  };

  const hasItems =
    groupedHistory.Today.length > 0 ||
    groupedHistory.Yesterday.length > 0 ||
    groupedHistory.Earlier.length > 0;

  return (
    <ScreenContainer meshVariant="home" hasTabBar={false}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color={C.textSecondary} strokeWidth={2} />
        </Pressable>
        <Text variant="headline" rawColor={C.textPrimary} style={{ fontWeight: '800' }}>
          Listening History
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Loading */}
      {isLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={C.brandHero} />
          <Text variant="subhead" rawColor={C.textSecondary} style={{ marginTop: 8 }}>
            Loading your listening history...
          </Text>
        </View>
      )}

      {/* Empty State */}
      {!isLoading && !hasItems && (
        <EmptyState
          pose="listening"
          title="No Listening History"
          message="Audio tracks you listen to will appear here so you can easily resume or play them again."
          actionLabel="Explore Library"
          onAction={() => router.push('/(tabs)/library')}
        />
      )}

      {/* Sections */}
      {!isLoading && hasItems && (
        <View style={styles.sectionsContainer}>
          {(['Today', 'Yesterday', 'Earlier'] as const).map((groupTitle) => {
            const list = groupedHistory[groupTitle];
            if (list.length === 0) return null;

            return (
              <View key={groupTitle} style={styles.groupSection}>
                <Text variant="caption" rawColor={C.textTertiary} style={styles.groupHeader}>
                  {groupTitle.toUpperCase()}
                </Text>

                <View style={styles.itemsList}>
                  {list.map((item) => {
                    const duration = item.track?.duration_seconds || 1;
                    const position = item.position_seconds || 0;
                    const percent = Math.min(100, Math.round((position / duration) * 100));
                    const title = item.track?.document?.title || 'Audio Explanation';

                    return (
                      <GlassCard
                        key={item.track_id}
                        style={styles.card}
                        padding={10}
                        borderRadius={14}
                      >
                        <View style={styles.topRow}>
                          <View style={styles.iconCircle}>
                            <Headphones size={18} color={C.brandHero} strokeWidth={2.2} />
                          </View>
                          <View style={styles.infoCol}>
                            <Text
                              variant="subhead"
                              rawColor={C.textPrimary}
                              numberOfLines={1}
                              style={{ fontWeight: '700' }}
                            >
                              {title}
                            </Text>
                            <View style={styles.timeRow}>
                              <Clock size={11} color={C.textTertiary} />
                              <Text variant="caption" rawColor={C.textTertiary} style={{ marginLeft: 4 }}>
                                {formatDuration(position)} / {formatDuration(duration)}
                              </Text>
                              {item.completed && (
                                <View style={styles.completedPill}>
                                  <CheckCircle2 size={10} color={C.success} />
                                  <Text variant="caption" rawColor={C.success} style={{ fontSize: 9, fontWeight: '700' }}>
                                    Completed
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Play / Resume CTA */}
                          <Pressable
                            style={styles.playBtn}
                            onPress={() => handlePlayAgain(item)}
                          >
                            <Play size={15} color={C.textInverse} strokeWidth={2.5} />
                          </Pressable>
                        </View>

                        {/* Progress Bar */}
                        <View style={{ marginTop: 8 }}>
                          <ProgressBar progress={percent} height={6} />
                        </View>
                      </GlassCard>
                    );
                  })}
                </View>
              </View>
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
    marginBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionsContainer: {
    gap: 14,
  },
  groupSection: {
    marginBottom: 4,
  },
  groupHeader: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  itemsList: {
    gap: 8,
  },
  card: {
    marginBottom: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 3,
    marginLeft: 8,
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
});
