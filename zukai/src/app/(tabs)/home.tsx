/**
 * ZUKAI — Home Dashboard Screen (Phase UI-V2)
 * High-density dark glossy AI dashboard matching the reference specification.
 * Fully wired to live Supabase backend data, real documents, real streak, real progress.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
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
  Sparkles,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { HeroCard } from '@/components/HeroCard';
import { ShinyButton } from '@/components/ShinyButton';
import { RoundArrowButton } from '@/components/RoundArrowButton';
import { HaloPlayButton } from '@/components/HaloPlayButton';
import { Text } from '@/components/Text';
import { Mascot } from '@/components/Mascot';
import { ProgressBar } from '@/components/ProgressBar';
import { DocumentRow } from '@/components/DocumentRow';
import { EmptyState } from '@/components/EmptyState';
import { useLibrary } from '@/features/library/hooks/useLibrary';
import { useUsageSummary } from '@/features/usage/hooks/useUsageSummary';
import { useAuthStore } from '@/lib/authStore';
import { usePlaybackStore } from '@/features/playback/playbackStore';
import { supabase } from '@/lib/supabase';
import { mascotImages } from '../../assets/mascot/index';

const C = {
  nearBlack: '#0B1418',
  brandHero: '#8EF20F',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textDark: '#0B1418',
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

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning!';
  if (hour < 18) return 'Good afternoon!';
  return 'Good evening!';
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

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { activeTrack, isPlaying: isStorePlaying, playTrack, togglePlayPause } = usePlaybackStore();

  const { data: libraryItems = [], isLoading: isLoadingLibrary, error: libraryError, refetch: refetchLibrary } = useLibrary();
  const { data: usageSummary, refetch: refetchUsage } = useUsageSummary();
  const [refreshing, setRefreshing] = useState(false);

  const [learningStats, setLearningStats] = useState<LearningStats>({
    total_minutes: 0,
    tracks_completed: 0,
    streak_days: 1,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchLibrary(),
      refetchUsage(),
      supabase.rpc('get_learning_stats').then(({ data, error }) => {
        if (data && !error) {
          setLearningStats(data as LearningStats);
        }
      }),
    ]).catch(() => {});
    setRefreshing(false);
  };

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

  const greetingName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Explorer';
  const readyItems = libraryItems.filter((i) => i.track && i.document.status === 'ready');
  const activeHeroItem = readyItems[0] || libraryItems[0];
  const isHeroPlaying = Boolean(activeHeroItem?.track && activeTrack?.id === activeHeroItem.track.id && isStorePlaying);

  // Daily goal calculation (10 min goal)
  const dailyGoalMinutes = 10;
  const minutesListenedToday = Math.min(dailyGoalMinutes, Math.round(learningStats.total_minutes));
  const dailyGoalPercent = Math.min(100, Math.round((minutesListenedToday / dailyGoalMinutes) * 100));

  return (
    <ScreenContainer
      meshVariant="home"
      hasTabBar
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={C.brandHero}
          colors={[C.brandHero]}
        />
      }
    >
      {/* ─── 1. Header Row (Reference Structure) ───────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {/* Zuke Face Avatar */}
          <View style={styles.avatarBorder}>
            <Image
              source={mascotImages.base}
              style={styles.avatarImg}
              contentFit="cover"
            />
          </View>
          <View style={styles.headerGreetingCol}>
            <Text variant="caption" rawColor={C.textTertiary} style={styles.greetingSmall}>
              {getTimeOfDayGreeting()}
            </Text>
            <Text variant="title2" rawColor={C.textPrimary} style={styles.greetingLarge}>
              {greetingName}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Unread Bell Notification Button */}
          <Pressable
            style={styles.bellButton}
            onPress={() => router.push('/(tabs)/settings')}
            accessibilityRole="button"
            accessibilityLabel="Notifications and settings"
          >
            <LinearGradient
              colors={['#1F2B33', '#11181C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.bellGloss} />
            <Bell size={18} color={C.textPrimary} strokeWidth={2.2} />
            {/* Unread Indicator Badge */}
            <View style={styles.bellBadge} />
          </Pressable>
        </View>
      </View>

      {/* ─── 2. Hero Wide LIME Card: "Turn any document into audio" ──────── */}
      <View style={styles.sectionWrap}>
        <HeroCard
          variant="lime"
          size="wide"
          mascot="wave"
          animated
          onPress={() => router.push('/(tabs)/upload')}
          accessibilityLabel="Turn any document into audio, upload now"
        >
          <View style={styles.heroLimeContent}>
            <Text variant="title2" rawColor={C.textDark} style={styles.heroLimeTitle}>
              Turn any document into audio
            </Text>
            <Text variant="footnote" rawColor="rgba(11, 20, 24, 0.75)" style={styles.heroLimeBody}>
              Upload PDFs, slides or notes to get interactive AI studio lessons.
            </Text>
            <View style={styles.heroLimeBtnWrap}>
              <ShinyButton
                variant="dark-glossy"
                size="sm"
                label="Upload now"
                icon={<Upload size={14} color="#FFF" />}
                onPress={() => router.push('/(tabs)/upload')}
              />
            </View>
          </View>
        </HeroCard>
      </View>

      {/* ─── 3. In-Progress & Paused Jobs (Compact Glass Cards) ─────────── */}
      {activeJobs.length > 0 && (
        <View style={styles.sectionWrap}>
          <Pressable
            onPress={() => router.push(`/processing/${activeJobs[0].id}` as any)}
            accessibilityRole="button"
            accessibilityLabel="View processing status"
          >
            <GlassCard style={styles.jobGlassCard} padding={12} borderRadius={20}>
              <View style={styles.jobRow}>
                <View style={styles.jobMascotWrap}>
                  <Mascot
                    pose={activeJobs.some((j) => j.status === 'waiting_for_capacity') ? 'coffee' : 'typing'}
                    size={42}
                    animated={false}
                  />
                </View>
                <View style={styles.jobTextCol}>
                  <View style={styles.jobTitleRow}>
                    <PulsingDot />
                    <Text variant="subhead" rawColor={C.textPrimary} style={styles.jobStatusTitle}>
                      {activeJobs.some((j) => j.status === 'waiting_for_capacity')
                        ? 'AI Voice Paused • Catching Breath'
                        : 'Audio Generation In Progress'}
                    </Text>
                  </View>
                  <Text variant="caption" rawColor={C.textTertiary}>
                    {activeJobs.length} active job{activeJobs.length > 1 ? 's' : ''} • Tap to view real-time log
                  </Text>
                </View>
                <RoundArrowButton
                  onPress={() => router.push(`/processing/${activeJobs[0].id}` as any)}
                  variant="dark-glossy"
                  size={32}
                />
              </View>
            </GlassCard>
          </Pressable>
        </View>
      )}

      {/* ─── 4. Continue Listening (Wide FOREST Card with Real Position) ── */}
      {!isLoadingLibrary && activeHeroItem && activeHeroItem.track && (
        <View style={styles.sectionWrap}>
          <HeroCard
            variant="forest"
            size="wide"
            mascot="headphones"
            onPress={() => router.push('/player' as any)}
            accessibilityLabel={`Continue listening: ${activeHeroItem.document.title}`}
          >
            <View style={styles.forestContent}>
              <View style={styles.forestHeaderRow}>
                <View style={styles.forestBadge}>
                  <PulsingDot />
                  <Text variant="caption" rawColor={C.brandHero} style={styles.forestBadgeText}>
                    CONTINUE LISTENING
                  </Text>
                </View>
              </View>

              <Text variant="headline" rawColor={C.textPrimary} numberOfLines={1} style={styles.forestDocTitle}>
                {activeHeroItem.document.title}
              </Text>

              {/* Real Chunky Progress Bar */}
              <View style={styles.forestProgressWrap}>
                <ProgressBar
                  progress={
                    activeHeroItem.track && activeHeroItem.progress
                      ? Math.min(100, Math.round(((activeHeroItem.progress.position_seconds || 0) / (activeHeroItem.track.duration_seconds || 1)) * 100))
                      : 0
                  }
                  height={10}
                />
              </View>

              <View style={styles.forestFooterRow}>
                <Text variant="caption" rawColor={C.textTertiary}>
                  {formatDuration(Math.round(activeHeroItem.progress?.position_seconds ?? 0))} / {formatDuration(activeHeroItem.track.duration_seconds)}
                </Text>

                <View style={styles.forestPlayWrap}>
                  <HaloPlayButton
                    isPlaying={isHeroPlaying}
                    size={38}
                    ringOffset={4}
                    onPress={() => {
                      if (activeHeroItem.track) {
                        if (activeTrack?.id === activeHeroItem.track.id) {
                          togglePlayPause();
                        } else {
                          playTrack(activeHeroItem.track, activeHeroItem.document.title);
                        }
                      }
                    }}
                  />
                </View>
              </View>
            </View>
          </HeroCard>
        </View>
      )}

      {/* ─── 5. Section "Suggested for you" (Bento Bento Layout) ────────── */}
      <View style={styles.sectionHeader}>
        <Text variant="title3" rawColor={C.textPrimary} style={styles.sectionHeading}>
          Suggested for you
        </Text>
        <Pressable onPress={() => router.push('/(tabs)/library')} hitSlop={8}>
          <Text variant="subhead" rawColor={C.brandHero} style={{ fontWeight: '700' }}>
            See all
          </Text>
        </Pressable>
      </View>

      <View style={styles.bentoRow}>
        {/* Left: TALL Lime Card (Reach your daily goal) */}
        <View style={styles.bentoLeftCol}>
          <HeroCard
            variant="lime"
            size="tall"
            mascot="trophy"
            onPress={() => router.push('/(tabs)/settings')}
            accessibilityLabel="Reach your daily goal. Set or view learning targets."
          >
            <View style={styles.tallCardContent}>
              <View style={styles.tallBadge}>
                <Clock size={12} color="#0B1418" strokeWidth={2.4} />
                <Text variant="caption" rawColor="#0B1418" style={{ fontWeight: '800', fontSize: 10 }}>
                  DAILY GOAL
                </Text>
              </View>

              <Text variant="headline" rawColor={C.textDark} style={styles.tallTitle}>
                Reach your daily goal
              </Text>

              <Text variant="caption" rawColor="rgba(11,20,24,0.70)" style={styles.tallSubtitle}>
                {minutesListenedToday} of {dailyGoalMinutes} min today
              </Text>

              <View style={styles.tallProgressWrap}>
                <ProgressBar progress={dailyGoalPercent} height={8} />
              </View>

              <View style={styles.tallBtnWrap}>
                <ShinyButton
                  variant="dark-glossy"
                  size="sm"
                  label="View Goal"
                  onPress={() => router.push('/(tabs)/settings')}
                />
              </View>
            </View>
          </HeroCard>
        </View>

        {/* Right: TWO Compact Dark Glass Cards Stacked */}
        <View style={styles.bentoRightCol}>
          {/* Card 1: Your streak */}
          <GlassCard style={styles.bentoStackedCard} padding={12} borderRadius={20}>
            <View style={styles.bentoCardInner}>
              <View style={styles.bentoTopLine}>
                <View style={[styles.iconChip, { backgroundColor: 'rgba(255, 149, 0, 0.15)', borderColor: 'rgba(255, 149, 0, 0.35)' }]}>
                  <Flame size={16} color="#FF9500" strokeWidth={2.5} />
                </View>
                <RoundArrowButton
                  variant="glass"
                  size={32}
                  onPress={() => router.push('/history')}
                />
              </View>
              <View style={styles.bentoTextWrap}>
                <Text variant="subhead" rawColor={C.textPrimary} style={styles.bentoCardTitle}>
                  Your streak
                </Text>
                <Text variant="caption" rawColor="#FF9500" style={styles.bentoCardHighlight}>
                  {learningStats.streak_days} days on fire 🔥
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Card 2: Listen again */}
          <GlassCard style={styles.bentoStackedCard} padding={12} borderRadius={20}>
            <View style={styles.bentoCardInner}>
              <View style={styles.bentoTopLine}>
                <View style={[styles.iconChip, { backgroundColor: 'rgba(142, 242, 15, 0.15)', borderColor: 'rgba(142, 242, 15, 0.35)' }]}>
                  <History size={16} color={C.brandHero} strokeWidth={2.4} />
                </View>
                <RoundArrowButton
                  variant="glass"
                  size={32}
                  onPress={() => router.push('/history')}
                />
              </View>
              <View style={styles.bentoTextWrap}>
                <Text variant="subhead" rawColor={C.textPrimary} style={styles.bentoCardTitle}>
                  Listen again
                </Text>
                <Text variant="caption" rawColor={C.textSecondary} style={styles.bentoCardHighlight}>
                  {learningStats.tracks_completed} finished tracks
                </Text>
              </View>
            </View>
          </GlassCard>
        </View>
      </View>

      {/* ─── 6. Section "Quick access" (2-Column Grid of Dark Cards) ───── */}
      <View style={styles.sectionHeader}>
        <Text variant="title3" rawColor={C.textPrimary} style={styles.sectionHeading}>
          Quick access
        </Text>
      </View>

      <View style={styles.quickGrid}>
        {/* Tile 1: Library */}
        <Pressable
          style={styles.gridTile}
          onPress={() => router.push('/(tabs)/library')}
          accessibilityRole="button"
          accessibilityLabel="Open Library"
        >
          <GlassCard style={styles.tileCard} padding={14} borderRadius={20}>
            <View style={styles.tileTop}>
              <View style={[styles.iconChipRound, { backgroundColor: 'rgba(142,242,15,0.15)', borderColor: 'rgba(142,242,15,0.35)' }]}>
                <BookOpen size={18} color={C.brandHero} strokeWidth={2.4} />
              </View>
              <RoundArrowButton
                variant="glass"
                size={30}
                onPress={() => router.push('/(tabs)/library')}
              />
            </View>
            <Text variant="subhead" rawColor={C.textPrimary} style={styles.tileTitle}>
              Library
            </Text>
            <Text variant="caption" rawColor={C.textTertiary} numberOfLines={1}>
              {libraryItems.length} saved document{libraryItems.length === 1 ? '' : 's'}
            </Text>
          </GlassCard>
        </Pressable>

        {/* Tile 2: Downloads */}
        <Pressable
          style={styles.gridTile}
          onPress={() => router.push('/downloads')}
          accessibilityRole="button"
          accessibilityLabel="Open Downloads"
        >
          <GlassCard style={styles.tileCard} padding={14} borderRadius={20}>
            <View style={styles.tileTop}>
              <View style={[styles.iconChipRound, { backgroundColor: 'rgba(0, 230, 118, 0.15)', borderColor: 'rgba(0, 230, 118, 0.35)' }]}>
                <Download size={18} color="#00E676" strokeWidth={2.4} />
              </View>
              <RoundArrowButton
                variant="glass"
                size={30}
                onPress={() => router.push('/downloads')}
              />
            </View>
            <Text variant="subhead" rawColor={C.textPrimary} style={styles.tileTitle}>
              Downloads
            </Text>
            <Text variant="caption" rawColor={C.textTertiary} numberOfLines={1}>
              Offline audio tracks
            </Text>
          </GlassCard>
        </Pressable>

        {/* Tile 3: History */}
        <Pressable
          style={styles.gridTile}
          onPress={() => router.push('/history')}
          accessibilityRole="button"
          accessibilityLabel="Open History"
        >
          <GlassCard style={styles.tileCard} padding={14} borderRadius={20}>
            <View style={styles.tileTop}>
              <View style={[styles.iconChipRound, { backgroundColor: 'rgba(0, 176, 255, 0.15)', borderColor: 'rgba(0, 176, 255, 0.35)' }]}>
                <History size={18} color="#00B0FF" strokeWidth={2.4} />
              </View>
              <RoundArrowButton
                variant="glass"
                size={30}
                onPress={() => router.push('/history')}
              />
            </View>
            <Text variant="subhead" rawColor={C.textPrimary} style={styles.tileTitle}>
              History
            </Text>
            <Text variant="caption" rawColor={C.textTertiary} numberOfLines={1}>
              {learningStats.tracks_completed} completed tracks
            </Text>
          </GlassCard>
        </Pressable>

        {/* Tile 4: Analytics / Learning Stats */}
        <Pressable
          style={styles.gridTile}
          onPress={() => router.push('/(tabs)/settings')}
          accessibilityRole="button"
          accessibilityLabel="Open Learning Stats in Settings"
        >
          <GlassCard style={styles.tileCard} padding={14} borderRadius={20}>
            <View style={styles.tileTop}>
              <View style={[styles.iconChipRound, { backgroundColor: 'rgba(217, 70, 239, 0.15)', borderColor: 'rgba(217, 70, 239, 0.35)' }]}>
                <TrendingUp size={18} color="#D946EF" strokeWidth={2.4} />
              </View>
              <RoundArrowButton
                variant="glass"
                size={30}
                onPress={() => router.push('/(tabs)/settings')}
              />
            </View>
            <Text variant="subhead" rawColor={C.textPrimary} style={styles.tileTitle}>
              Favorites & Stats
            </Text>
            <Text variant="caption" rawColor={C.textTertiary} numberOfLines={1}>
              {formatMinutes(learningStats.total_minutes)} total listened
            </Text>
          </GlassCard>
        </Pressable>
      </View>

      {/* ─── 7. Recent Documents Section ─────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text variant="title3" rawColor={C.textPrimary} style={styles.sectionHeading}>
          Recent Documents
        </Text>
        <Pressable onPress={() => router.push('/(tabs)/library')} hitSlop={8}>
          <Text variant="subhead" rawColor={C.brandHero} style={{ fontWeight: '700' }}>
            View all
          </Text>
        </Pressable>
      </View>

      {/* Clean Document Rows (No Art Inside Rows) */}
      {!isLoadingLibrary && libraryItems.length > 0 && (
        <View style={styles.documentListWrap}>
          {libraryItems.slice(0, 4).map((item) => (
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
          ))}
        </View>
      )}

      {/* Empty State */}
      {!isLoadingLibrary && libraryItems.length === 0 && !libraryError && (
        <View style={styles.sectionWrap}>
          <HeroCard
            variant="lime"
            size="wide"
            mascot="reading"
            onPress={() => router.push('/(tabs)/upload')}
          >
            <View style={styles.heroLimeContent}>
              <Text variant="title3" rawColor={C.textDark} style={styles.heroLimeTitle}>
                Your library is empty
              </Text>
              <Text variant="caption" rawColor="rgba(11,20,24,0.75)" style={styles.heroLimeBody}>
                Upload your first document to experience AI-narrated audio learning.
              </Text>
              <View style={styles.heroLimeBtnWrap}>
                <ShinyButton
                  variant="dark-glossy"
                  size="sm"
                  label="Upload Document"
                  onPress={() => router.push('/(tabs)/upload')}
                />
              </View>
            </View>
          </HeroCard>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBorder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#8EF20F',
    backgroundColor: '#12191E',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8EF20F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarImg: {
    width: 38,
    height: 38,
  },
  headerGreetingCol: {
    marginLeft: 12,
  },
  greetingSmall: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  greetingLarge: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    position: 'relative',
  },
  bellGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderTopLeftRadius: 21,
    borderTopRightRadius: 21,
  },
  bellBadge: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8EF20F',
    borderWidth: 1.5,
    borderColor: '#0B1418',
  },
  sectionWrap: {
    marginBottom: 16,
  },
  heroLimeContent: {
    paddingVertical: 4,
  },
  heroLimeTitle: {
    fontWeight: '800',
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  heroLimeBody: {
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },
  heroLimeBtnWrap: {
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  jobGlassCard: {
    borderWidth: 1,
    borderColor: 'rgba(142, 242, 15, 0.35)',
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobMascotWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(142, 242, 15, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  jobTextCol: {
    flex: 1,
  },
  jobTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  jobStatusTitle: {
    marginLeft: 6,
    fontWeight: '700',
    fontSize: 13,
  },
  forestContent: {
    paddingVertical: 2,
  },
  forestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  forestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(142, 242, 15, 0.25)',
  },
  forestBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginLeft: 5,
  },
  forestDocTitle: {
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  forestProgressWrap: {
    marginTop: 10,
  },
  forestFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  forestPlayWrap: {
    position: 'absolute',
    right: -4,
    bottom: -4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 12,
  },
  sectionHeading: {
    fontWeight: '800',
    fontSize: 19,
    letterSpacing: -0.3,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  bentoLeftCol: {
    flex: 1.1,
  },
  bentoRightCol: {
    flex: 1,
    gap: 12,
  },
  tallCardContent: {
    paddingVertical: 2,
  },
  tallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  tallTitle: {
    fontWeight: '800',
    fontSize: 17,
    lineHeight: 21,
  },
  tallSubtitle: {
    marginTop: 4,
    fontWeight: '600',
  },
  tallProgressWrap: {
    marginTop: 10,
    marginBottom: 12,
  },
  tallBtnWrap: {
    alignSelf: 'flex-start',
  },
  bentoStackedCard: {
    flex: 1,
    justifyContent: 'center',
  },
  bentoCardInner: {
    justifyContent: 'space-between',
  },
  bentoTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoTextWrap: {
    gap: 2,
  },
  bentoCardTitle: {
    fontWeight: '700',
    fontSize: 14,
  },
  bentoCardHighlight: {
    fontSize: 11,
    fontWeight: '600',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  gridTile: {
    width: '48%',
    flexGrow: 1,
  },
  tileCard: {
    height: 106,
    justifyContent: 'space-between',
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconChipRound: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontWeight: '700',
    fontSize: 15,
    marginTop: 6,
  },
  documentListWrap: {
    gap: 8,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#8EF20F',
  },
});
