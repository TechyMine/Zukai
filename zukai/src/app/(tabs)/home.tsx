/**
 * ZUKAI — Home Dashboard Screen (Phase 7C Polish)
 * Connected to live Supabase data layer via TanStack Query hooks.
 * Displays user profile, streak calendar, daily goal progress, 2x2 stat tiles,
 * compact continue listening hero card, quick actions, and standardized DocumentRow items.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  Play,
  ChevronRight,
  Pause,
  Upload,
  BookOpen,
  Download,
  Flame,
  CheckCircle2,
  Headphones,
  Clock,
  History,
  FileText,
  X,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { Text } from '@/components/Text';
import { Mascot } from '@/components/Mascot';
import { BrandLogo } from '@/components/BrandLogo';
import { StatTile } from '@/components/StatTile';
import { ProgressBar } from '@/components/ProgressBar';
import { EmptyState } from '@/components/EmptyState';
import { DocumentRow } from '@/components/DocumentRow';
import { useLibrary } from '@/features/library/hooks/useLibrary';
import { useUsageSummary } from '@/features/usage/hooks/useUsageSummary';
import { useAuthStore } from '@/lib/authStore';
import { usePlaybackStore } from '@/features/playback/playbackStore';
import { supabase } from '@/lib/supabase';

const C = {
  brandHero: '#8EF20F',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textInverse: '#09161B',
  success: '#00E676',
};

function PulsingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.pulseDot, style]} />;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

interface QuickAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}

interface ActiveJob {
  id: string;
  status: string;
  created_at: string;
}

interface LearningStats {
  total_minutes: number;
  tracks_completed: number;
  streak_days: number;
}

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { activeTrack, isPlaying: isStorePlaying, playTrack, togglePlayPause } = usePlaybackStore();

  const { data: libraryItems = [], isLoading: isLoadingLibrary, error: libraryError } = useLibrary();
  const { data: usageSummary } = useUsageSummary();

  const [showMascotTip, setShowMascotTip] = useState(true);

  const [learningStats, setLearningStats] = useState<LearningStats>({
    total_minutes: 0,
    tracks_completed: 0,
    streak_days: 1,
  });

  useEffect(() => {
    supabase.rpc('get_learning_stats').then(({ data, error }) => {
      if (data && !error) {
        setLearningStats(data as LearningStats);
      }
    });
  }, []);

  const { data: activeJobs = [] } = useQuery<ActiveJob[]>({
    queryKey: ['active-jobs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audio_jobs')
        .select('id, status, created_at')
        .not('status', 'in', '(ready,failed,canceled)')
        .order('created_at', { ascending: false });
      return (data ?? []) as ActiveJob[];
    },
    refetchInterval: 5000,
    staleTime: 0,
  });

  const greetingName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Scholar';
  const readyItems = libraryItems.filter((i) => i.track && i.document.status === 'ready');
  const activeHeroItem = readyItems[0] || libraryItems[0];
  const isHeroPlaying = Boolean(activeHeroItem?.track && activeTrack?.id === activeHeroItem.track.id && isStorePlaying);

  // Daily goal calculation
  const dailyGoalMinutes = 10;
  const minutesListenedToday = Math.min(dailyGoalMinutes, Math.round(learningStats.total_minutes));
  const dailyGoalPercent = Math.min(100, Math.round((minutesListenedToday / dailyGoalMinutes) * 100));

  const currentDayIndex = (new Date().getDay() + 6) % 7; // Mon=0 .. Sun=6

  const quickActions: QuickAction[] = [
    {
      key: 'upload',
      label: 'Upload',
      icon: <Upload size={18} color={C.brandHero} strokeWidth={2.2} />,
      onPress: () => router.push('/(tabs)/upload'),
    },
    {
      key: 'library',
      label: 'Library',
      icon: <BookOpen size={18} color={C.brandHero} strokeWidth={2.2} />,
      onPress: () => router.push('/(tabs)/library'),
    },
    {
      key: 'downloads',
      label: 'Downloads',
      icon: <Download size={18} color={C.brandHero} strokeWidth={2.2} />,
      onPress: () => router.push('/downloads'),
    },
    {
      key: 'history',
      label: 'History',
      icon: <History size={18} color={C.brandHero} strokeWidth={2.2} />,
      onPress: () => router.push('/history'),
    },
  ];

  return (
    <ScreenContainer meshVariant="home" hasTabBar>
      {/* 1. Header Row (Height 48) */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <BrandLogo size={36} showText={false} />
          <View style={{ marginLeft: 10 }}>
            <Text variant="caption" rawColor={C.textTertiary} style={styles.greetingCaption}>
              WELCOME BACK
            </Text>
            <Text variant="headline" rawColor={C.textPrimary} style={styles.greetingTitle}>
              {greetingName}
            </Text>
          </View>
        </View>

        <View style={styles.topBarRight}>
          <View style={styles.streakChip}>
            <Flame size={14} color="#FF9500" strokeWidth={2.5} />
            <Text variant="caption" rawColor="#FF9500" style={styles.streakText}>
              {learningStats.streak_days}d
            </Text>
          </View>

          <Pressable
            style={styles.bellBtn}
            onPress={() => router.push('/(tabs)/settings')}
            accessibilityLabel="Settings"
          >
            <Bell size={18} color={C.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* 2. Weekly Streak Row (S M T W T F S) */}
      <GlassCard style={styles.weekCard} padding={10} borderRadius={16}>
        <View style={styles.weekHeader}>
          <Text variant="caption" rawColor={C.textSecondary} style={{ fontWeight: '700' }}>
            WEEKLY STREAK
          </Text>
          <Text variant="caption" rawColor={C.brandHero} style={{ fontWeight: '700' }}>
            {learningStats.streak_days} DAYS ON FIRE 🔥
          </Text>
        </View>
        <View style={styles.weekDaysRow}>
          {WEEK_DAYS.map((day, idx) => {
            const isToday = idx === currentDayIndex;
            const isPast = idx < currentDayIndex;
            const isCompleted = isPast || (isToday && minutesListenedToday > 0);

            return (
              <View
                key={`${day}-${idx}`}
                style={[
                  styles.dayCircle,
                  isToday && styles.dayCircleToday,
                  isCompleted && !isToday && styles.dayCircleCompleted,
                ]}
              >
                <Text
                  variant="caption"
                  rawColor={isToday ? '#09161B' : isCompleted ? C.brandHero : C.textTertiary}
                  style={styles.dayText}
                >
                  {day}
                </Text>
              </View>
            );
          })}
        </View>
      </GlassCard>

      {/* 3. Daily Goal Card with Chunky ProgressBar */}
      <GlassCard style={styles.dailyGoalCard} padding={12} borderRadius={16}>
        <View style={styles.dailyGoalHeader}>
          <View style={styles.rowCenter}>
            <Clock size={16} color={C.brandHero} strokeWidth={2.2} />
            <Text variant="subhead" rawColor={C.textPrimary} style={{ marginLeft: 6, fontWeight: '700' }}>
              Daily Learning Goal
            </Text>
          </View>
          <Text variant="caption" rawColor={C.brandHero} style={{ fontWeight: '700' }}>
            {minutesListenedToday} / {dailyGoalMinutes} min
          </Text>
        </View>
        <ProgressBar progress={dailyGoalPercent} height={14} style={{ marginTop: 8 }} />
      </GlassCard>

      {/* 4. 2x2 Grid of StatTiles */}
      <View style={styles.statsGrid}>
        <View style={styles.statRow}>
          <StatTile
            icon={FileText}
            number={usageSummary?.documents_count ?? libraryItems.length}
            label="Documents"
            iconTint="#8EF20F"
          />
          <StatTile
            icon={Headphones}
            number={formatMinutes(learningStats.total_minutes)}
            label="Listened"
            iconTint="#00E676"
          />
        </View>
        <View style={styles.statRow}>
          <StatTile
            icon={Flame}
            number={`${learningStats.streak_days}d`}
            label="Day Streak"
            iconTint="#FF9500"
          />
          <StatTile
            icon={CheckCircle2}
            number={learningStats.tracks_completed}
            label="Completed"
            iconTint="#38BDF8"
          />
        </View>
      </View>

      {/* 5. In-Progress / Paused Jobs Banner (Compact) */}
      {activeJobs.length > 0 && (
        <Pressable
          style={styles.jobsBanner}
          onPress={() => router.push(`/processing/${activeJobs[0].id}` as Parameters<typeof router.push>[0])}
        >
          <PulsingDot />
          <Text variant="subhead" rawColor={C.textPrimary} style={{ flex: 1, marginLeft: 8 }}>
            {activeJobs.some((j) => j.status === 'waiting_for_capacity')
              ? 'AI voice catching breath • Resuming automatically'
              : `${activeJobs.length} explanation${activeJobs.length > 1 ? 's' : ''} generating…`}
          </Text>
          <ChevronRight size={16} color={C.textTertiary} />
        </Pressable>
      )}

      {/* 6. Quick Actions Strip */}
      <View style={styles.quickActionsContainer}>
        {quickActions.map((action) => (
          <Pressable key={action.key} style={styles.quickActionChip} onPress={action.onPress}>
            {action.icon}
            <Text variant="caption" rawColor={C.textSecondary} style={styles.quickActionLabel}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 7. Continue Listening Hero Card (~120dp) */}
      {!isLoadingLibrary && activeHeroItem && activeHeroItem.track && (
        <Pressable onPress={() => router.push('/player' as Parameters<typeof router.push>[0])}>
          <View style={styles.heroWrapper}>
            <LinearGradient
              colors={['rgba(19,40,48,0.95)', 'rgba(9,22,27,0.98)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.heroDocIcon}>
                  <Headphones size={18} color={C.brandHero} strokeWidth={2.2} />
                </View>
                <View style={styles.heroTextCol}>
                  <View style={styles.heroBadgeRow}>
                    <View style={styles.heroBadge}>
                      <PulsingDot />
                      <Text variant="caption" rawColor={C.brandHero} style={styles.badgeText}>
                        CONTINUE LISTENING
                      </Text>
                    </View>
                    <View style={styles.langPill}>
                      <Text variant="caption" rawColor="#A2B4BE" style={styles.langText}>
                        {activeHeroItem.document.title.includes('(Hinglish)') ? 'HINGLISH' : 'EN'}
                      </Text>
                    </View>
                  </View>
                  <Text variant="headline" rawColor={C.textPrimary} numberOfLines={1} style={styles.heroTitle}>
                    {activeHeroItem.document.title}
                  </Text>
                </View>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    if (activeHeroItem.track) {
                      if (activeTrack?.id === activeHeroItem.track.id) {
                        togglePlayPause();
                      } else {
                        playTrack(activeHeroItem.track, activeHeroItem.document.title);
                      }
                    }
                  }}
                  style={styles.heroPlayBtn}
                >
                  <LinearGradient
                    colors={['#A4F924', '#8EF20F', '#68C400']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.playCircle}
                  >
                    {isHeroPlaying ? (
                      <Pause size={16} color={C.textInverse} strokeWidth={2.5} />
                    ) : (
                      <Play size={16} color={C.textInverse} strokeWidth={2.5} />
                    )}
                  </LinearGradient>
                </Pressable>
              </View>

              <View style={styles.heroProgressWrap}>
                <ProgressBar
                  progress={
                    activeHeroItem.track && activeHeroItem.progress
                      ? Math.min(100, Math.round(((activeHeroItem.progress.position_seconds || 0) / (activeHeroItem.track.duration_seconds || 1)) * 100))
                      : 0
                  }
                  height={8}
                />
              </View>

              <View style={styles.heroFooter}>
                <Text variant="caption" rawColor={C.textTertiary}>
                  {formatDuration(Math.round(activeHeroItem.progress?.position_seconds ?? 0))} / {formatDuration(activeHeroItem.track.duration_seconds)}
                </Text>
                <Text variant="caption" rawColor={C.brandHero} style={{ fontWeight: '600' }}>
                  Tap to resume
                </Text>
              </View>
            </LinearGradient>
          </View>
        </Pressable>
      )}

      {/* Dismissible Mascot Learning Tip Card (inside content, never overlapping tab bar) */}
      {showMascotTip && libraryItems.length > 0 && (
        <GlassCard style={styles.mascotTipCard} padding={10} borderRadius={14}>
          <View style={styles.mascotTipRow}>
            <Mascot pose="listening" size={44} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text variant="subhead" rawColor={C.textPrimary} style={{ fontWeight: '700', fontSize: 13 }}>
                Zuke's Audio Tip
              </Text>
              <Text variant="caption" rawColor={C.textSecondary} numberOfLines={2}>
                Listening at 1.25x helps you absorb concepts 20% faster while maintaining full comprehension!
              </Text>
            </View>
            <Pressable onPress={() => setShowMascotTip(false)} hitSlop={10} style={{ padding: 4 }}>
              <X size={16} color={C.textTertiary} />
            </Pressable>
          </View>
        </GlassCard>
      )}

      {/* 8. Recent Documents Section */}
      <View style={styles.sectionHeader}>
        <Text variant="headline" rawColor={C.textPrimary}>Recent Documents</Text>
        <Pressable onPress={() => router.push('/(tabs)/library')} hitSlop={8}>
          <Text variant="subhead" rawColor={C.brandHero}>See all</Text>
        </Pressable>
      </View>

      {/* Standardized DocumentRow List */}
      {!isLoadingLibrary && libraryItems.length > 0 && (
        libraryItems.slice(0, 5).map((item) => (
          <DocumentRow
            key={item.document.id}
            title={item.document.title}
            originalFilename={item.document.original_filename}
            mimeType={item.document.mime_type}
            fileSizeBytes={item.document.file_size_bytes}
            durationSeconds={item.track?.duration_seconds}
            pageCount={item.document.page_count}
            createdAt={item.document.created_at}
            status={item.document.status}
            variant="home"
            onPress={() => {
              if (item.track && item.document.status === 'ready') {
                playTrack(item.track, item.document.title);
                router.push('/player' as any);
              } else if (item.document.status === 'failed') {
                router.push('/(tabs)/upload');
              } else {
                router.push('/(tabs)/library');
              }
            }}
          />
        ))
      )}

      {/* Empty State */}
      {!isLoadingLibrary && libraryItems.length === 0 && !libraryError && (
        <EmptyState
          pose="welcome"
          title="Your library is empty"
          message="Upload your first document (PDF or DOCX) to get an interactive audio explanation."
          actionLabel="Upload Document"
          onAction={() => router.push('/(tabs)/upload')}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  greetingCaption: {
    letterSpacing: 1.2,
    fontWeight: '700',
    fontSize: 9,
  },
  greetingTitle: {
    fontWeight: '800',
    fontSize: 16,
    lineHeight: 20,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.35)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  streakText: {
    fontWeight: '800',
    fontSize: 11,
  },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekCard: {
    marginBottom: 8,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    backgroundColor: '#8EF20F',
    borderColor: '#8EF20F',
  },
  dayCircleCompleted: {
    backgroundColor: 'rgba(142, 242, 15, 0.15)',
    borderColor: 'rgba(142, 242, 15, 0.35)',
  },
  dayText: {
    fontWeight: '700',
    fontSize: 12,
  },
  dailyGoalCard: {
    marginBottom: 10,
  },
  dailyGoalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsGrid: {
    gap: 8,
    marginBottom: 10,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  jobsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(142, 242, 15, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8EF20F',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  quickActionChip: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 12,
    gap: 6,
  },
  quickActionLabel: {
    fontWeight: '600',
    fontSize: 11,
  },
  heroWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(142, 242, 15, 0.35)',
    marginBottom: 12,
  },
  heroCard: {
    padding: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroDocIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(142, 242, 15, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(142, 242, 15, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: {
    flex: 1,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  langPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  langText: {
    fontSize: 8,
    fontWeight: '700',
  },
  heroTitle: {
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
  },
  heroPlayBtn: {
    width: 38,
    height: 38,
  },
  playCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#63B300',
  },
  heroProgressWrap: {
    marginTop: 8,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  mascotTipCard: {
    marginBottom: 12,
    backgroundColor: 'rgba(142, 242, 15, 0.06)',
    borderColor: 'rgba(142, 242, 15, 0.25)',
  },
  mascotTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
});
