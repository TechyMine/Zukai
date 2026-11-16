/**
 * ZUKAI — Live Processing Screen [jobId] (Phase 7B Compact Polish)
 * Realtime-driven synthesis progress, 140dp thinking mascot, current-step card,
 * chunky ProgressBar, 5-step checklist, time remaining estimate, notify toggle,
 * queued >60s server waiting recovery, and dev-mode simulator behind explicit setting.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
  Clock,
  BookOpen,
  FileSearch,
  PenTool,
  Mic,
  Sliders,
  Bell,
  X,
  AlertTriangle,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { Text } from '@/components/Text';
import { ShinyButton } from '@/components/ShinyButton';
import { Mascot } from '@/components/Mascot';
import { ProgressBar } from '@/components/ProgressBar';
import { useJob, useCancelJob, useCreateAudioJob } from '@/features/jobs/hooks/useJob';
import { usePlaybackStore } from '@/features/playback/playbackStore';
import { fetchTrackByJobId } from '@/features/tracks/api/tracksApi';
import { supabase } from '@/lib/supabase';
import { JobStatus, Database } from '@/types/database';
import { mapRpcError } from '@/lib/rpcErrors';

type AudioJobRow = Database['public']['Tables']['audio_jobs']['Row'];

const C = {
  brandHero: '#8EF20F',
  brandVisor: '#0BF807',
  canvasSurfaceRaised: '#132830',
  canvasSurfaceHighlight: '#18333D',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textInverse: '#09161B',
  success: '#00E676',
  warning: '#FFD600',
  error: '#FF5252',
};

interface StepDefinition {
  id: string;
  name: string;
  detail: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  activeStatus: JobStatus[];
  minProgress: number;
}

const FIVE_STEPS: StepDefinition[] = [
  {
    id: 'reading',
    name: 'Reading',
    detail: 'Extracting text and structure',
    icon: FileSearch,
    activeStatus: ['extracting'],
    minProgress: 15,
  },
  {
    id: 'understanding',
    name: 'Understanding',
    detail: 'Analyzing core ideas & key concepts',
    icon: BookOpen,
    activeStatus: ['extracting', 'scripting'],
    minProgress: 35,
  },
  {
    id: 'writing',
    name: 'Writing',
    detail: 'Drafting conversational explanation',
    icon: PenTool,
    activeStatus: ['scripting'],
    minProgress: 60,
  },
  {
    id: 'recording',
    name: 'Recording',
    detail: 'Streaming neural AI narration',
    icon: Mic,
    activeStatus: ['voicing'],
    minProgress: 85,
  },
  {
    id: 'final_touches',
    name: 'Final Touches',
    detail: 'Mastering MP3 & loudness leveling',
    icon: Sliders,
    activeStatus: ['assembling'],
    minProgress: 98,
  },
];

export default function ProcessingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ jobId: string }>();
  const jobId = params.jobId;

  const { data: realJob, refetch } = useJob(jobId);
  const cancelJobMutation = useCancelJob();
  const createJobMutation = useCreateAudioJob();
  const { playTrack } = usePlaybackStore();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isStartingPlayback, setIsStartingPlayback] = useState(false);
  const [notifyOnComplete, setNotifyOnComplete] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Dev simulator state: explicit setting defaults to false per Rule 4
  const [showDevControls, setShowDevControls] = useState(false);
  const [simulatedJob, setSimulatedJob] = useState<Partial<AudioJobRow> | null>(null);

  // Track elapsed seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const effectiveJob: Partial<AudioJobRow> = useMemo(() => {
    if (simulatedJob) return simulatedJob;
    return (
      realJob || {
        id: jobId || 'unknown',
        status: 'queued' as JobStatus,
        progress: 0,
        current_step: 'Waiting for worker...',
      }
    );
  }, [realJob, simulatedJob, jobId]);

  const status = effectiveJob.status || 'queued';
  const progress = effectiveJob.progress ?? 0;
  const isTerminal = status === 'ready' || status === 'failed' || status === 'canceled';

  // Check if job is stuck in queued for >60s
  const isQueuedProlonged = status === 'queued' && elapsedSeconds >= 60;

  // Mascot pose
  const mascotPose = useMemo(() => {
    if (status === 'ready') return 'success';
    if (status === 'failed') return 'error';
    if (status === 'waiting_for_capacity') return 'thinking';
    if (status === 'voicing' || status === 'assembling') return 'listening';
    return 'thinking';
  }, [status]);

  // Cancel Handler
  const handleConfirmCancel = async () => {
    if (!jobId) return;
    try {
      await cancelJobMutation.mutateAsync(jobId);
      setShowCancelModal(false);
      refetch();
    } catch (err: any) {
      const mapped = mapRpcError(err);
      Alert.alert(mapped.title, mapped.message);
    }
  };

  // Retry Handler
  const handleRetryJob = async () => {
    if (!realJob?.document_id) return;
    try {
      const newJob = await createJobMutation.mutateAsync({
        documentId: realJob.document_id,
        language: realJob.language,
        depth: realJob.depth,
        voice: realJob.voice,
      });
      router.replace(`/processing/${newJob.id}` as any);
    } catch (err: any) {
      const mapped = mapRpcError(err);
      Alert.alert(mapped.title, mapped.message);
    }
  };

  // Listen Now Handler
  const handleListenNow = async () => {
    if (!jobId) return;
    try {
      setIsStartingPlayback(true);
      const track = await fetchTrackByJobId(jobId);
      if (track) {
        let docTitle = 'Audio Explanation';
        if (realJob?.document_id) {
          const { data: doc } = await supabase
            .from('documents')
            .select('title')
            .eq('id', realJob.document_id)
            .maybeSingle();
          if (doc?.title) docTitle = doc.title;
        }
        await playTrack(track, docTitle);
      }
      router.push('/player' as any);
    } catch (err: any) {
      router.push('/player' as any);
    } finally {
      setIsStartingPlayback(false);
    }
  };

  // Notify Toggle Handler
  const handleToggleNotify = async (val: boolean) => {
    setNotifyOnComplete(val);
    if (val && Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
  };

  // Estimate remaining time
  const remainingEstimate = useMemo(() => {
    if (status === 'ready') return 'Ready now';
    if (status === 'waiting_for_capacity') return 'High demand • Resuming automatically';
    if (progress < 25) return 'About 1–2 min remaining';
    if (progress < 60) return 'About 1 min remaining';
    if (progress < 90) return 'Under 30 seconds remaining';
    return 'Finalizing audio...';
  }, [progress, status]);

  return (
    <View style={styles.root}>
      <ScreenContainer meshVariant="processing" hasTabBar={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => router.push('/(tabs)/home')}
            hitSlop={12}
          >
            <ChevronLeft size={22} color={C.textSecondary} strokeWidth={2} />
          </Pressable>
          <Text variant="headline" rawColor={C.textPrimary} style={{ fontWeight: '800' }}>
            {status === 'ready'
              ? 'Explanation Ready'
              : status === 'failed'
              ? 'Processing Failed'
              : status === 'waiting_for_capacity'
              ? 'High Demand'
              : 'Generating Audio'}
          </Text>
          {!isTerminal ? (
            <Pressable
              style={styles.cancelHeaderBtn}
              onPress={() => setShowCancelModal(true)}
              hitSlop={8}
            >
              <Text variant="caption" rawColor={C.textTertiary} style={{ fontWeight: '700' }}>
                Cancel
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {/* 1. Mascot (Thinking pose, 140dp) */}
        <View style={styles.mascotArea}>
          <Mascot pose={mascotPose} size={140} animated />
        </View>

        {/* 2. Current-Step Card with Single-Line Description */}
        <GlassCard style={styles.currentStepCard} padding={12} borderRadius={16}>
          <View style={styles.currentStepHeader}>
            <View style={styles.currentStepIconBox}>
              <Sparkles size={16} color={C.brandHero} strokeWidth={2.5} />
            </View>
            <View style={styles.currentStepTextCol}>
              <Text variant="headline" rawColor={C.textPrimary} numberOfLines={1} style={{ fontWeight: '700' }}>
                {status === 'queued'
                  ? 'Queued in Processing Pipeline'
                  : status === 'waiting_for_capacity'
                  ? 'High Demand Right Now'
                  : status === 'ready'
                  ? 'Audio Breakdown Ready!'
                  : status === 'failed'
                  ? 'Processing Interrupted'
                  : effectiveJob.current_step || 'Synthesizing Explanation...'}
              </Text>
              <Text
                variant="caption"
                rawColor={status === 'waiting_for_capacity' ? C.warning : C.textTertiary}
                numberOfLines={1}
              >
                {status === 'ready'
                  ? 'Ready to listen with synchronized chapters'
                  : status === 'failed'
                  ? effectiveJob.error_message || 'Content could not be synthesized'
                  : status === 'waiting_for_capacity'
                  ? 'Your audio will continue automatically'
                  : remainingEstimate}
              </Text>
            </View>
          </View>

          {/* Chunky ProgressBar with percentage */}
          {!isTerminal && (
            <View style={{ marginTop: 10 }}>
              <ProgressBar progress={progress} height={14} />
            </View>
          )}
        </GlassCard>

        {/* High Demand / Waiting for Capacity Banner */}
        {status === 'waiting_for_capacity' && (
          <GlassCard style={styles.stuckCard} padding={12} borderRadius={14}>
            <View style={styles.stuckRow}>
              <Clock size={18} color={C.warning} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text variant="subhead" rawColor={C.warning} style={{ fontWeight: '700' }}>
                  High Demand Right Now
                </Text>
                <Text variant="caption" rawColor={C.textSecondary} style={{ marginTop: 2 }}>
                  Your audio will continue automatically as AI models cool down. Your progress is saved.
                </Text>
              </View>
            </View>
            <View style={styles.stuckBtnRow}>
              <Pressable onPress={() => setShowCancelModal(true)} style={styles.stuckCancelBtn}>
                <Text variant="caption" rawColor={C.textTertiary}>Cancel</Text>
              </Pressable>
            </View>
          </GlassCard>
        )}

        {/* Stuck in Queue Alert (>60s) */}
        {isQueuedProlonged && !isTerminal && (
          <GlassCard style={styles.stuckCard} padding={12} borderRadius={14}>
            <View style={styles.stuckRow}>
              <AlertTriangle size={18} color={C.warning} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text variant="subhead" rawColor={C.warning} style={{ fontWeight: '700' }}>
                  Waiting for processing server
                </Text>
                <Text variant="caption" rawColor={C.textSecondary} style={{ marginTop: 2 }}>
                  Your document is queued. The AI worker is preparing your audio.
                </Text>
              </View>
            </View>
            <View style={styles.stuckBtnRow}>
              <Pressable onPress={() => setShowCancelModal(true)} style={styles.stuckCancelBtn}>
                <Text variant="caption" rawColor={C.textTertiary}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleRetryJob} style={styles.stuckRetryBtn}>
                <Text variant="caption" rawColor={C.textInverse} style={{ fontWeight: '700' }}>
                  Retry Now
                </Text>
              </Pressable>
            </View>
          </GlassCard>
        )}

        {/* 3. Vertical 5-Step Checklist */}
        <GlassCard style={styles.stepsCard} padding={12} borderRadius={16}>
          <Text variant="caption" rawColor={C.textTertiary} style={styles.stepsTitle}>
            PIPELINE STAGES
          </Text>
          {FIVE_STEPS.map((st, idx) => {
            const StepIcon = st.icon;
            const isCompleted =
              status === 'ready' ||
              (status !== 'failed' && status !== 'queued' && progress >= st.minProgress);
            const isActive =
              !isCompleted &&
              status !== 'failed' &&
              status !== 'queued' &&
              st.activeStatus.includes(status);

            return (
              <View key={st.id} style={styles.stepItem}>
                <View style={styles.stepIndicatorCol}>
                  <View
                    style={[
                      styles.stepIconWrap,
                      isCompleted && styles.stepCompleted,
                      isActive && styles.stepActive,
                    ]}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={14} color="#09161B" strokeWidth={3} />
                    ) : isActive ? (
                      <ActivityIndicator size="small" color={C.brandHero} />
                    ) : (
                      <StepIcon size={14} color={C.textTertiary} strokeWidth={2} />
                    )}
                  </View>
                  {idx < FIVE_STEPS.length - 1 && (
                    <View
                      style={[
                        styles.stepLine,
                        isCompleted && { backgroundColor: C.brandHero },
                      ]}
                    />
                  )}
                </View>

                <View style={styles.stepDetails}>
                  <Text
                    variant="subhead"
                    rawColor={isCompleted ? C.textPrimary : isActive ? C.brandHero : C.textTertiary}
                    style={{ fontWeight: isActive || isCompleted ? '700' : '500' }}
                  >
                    {st.name}
                  </Text>
                  <Text variant="caption" rawColor={C.textTertiary} numberOfLines={1}>
                    {st.detail}
                  </Text>
                </View>
              </View>
            );
          })}
        </GlassCard>

        {/* 4. "Notify me when ready" Toggle */}
        {!isTerminal && (
          <GlassCard style={styles.notifyCard} padding={10} borderRadius={14}>
            <View style={styles.notifyRow}>
              <View style={styles.notifyIcon}>
                <Bell size={16} color={C.brandHero} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text variant="subhead" rawColor={C.textPrimary} style={{ fontWeight: '600' }}>
                  Notify me when ready
                </Text>
                <Text variant="caption" rawColor={C.textTertiary}>
                  You can leave this screen anytime
                </Text>
              </View>
              <Switch
                value={notifyOnComplete}
                onValueChange={handleToggleNotify}
                trackColor={{ false: C.canvasSurfaceRaised, true: C.brandHero }}
                thumbColor={C.textPrimary}
              />
            </View>
          </GlassCard>
        )}

        {/* 5. Terminal State Actions */}
        {status === 'ready' && (
          <View style={styles.actionArea}>
            <ShinyButton
              label={isStartingPlayback ? 'LOADING AUDIO...' : 'LISTEN NOW'}
              variant="primary"
              size="lg"
              fullWidth
              loading={isStartingPlayback}
              icon={<Play size={18} color={C.textInverse} strokeWidth={2.5} />}
              onPress={handleListenNow}
            />
          </View>
        )}

        {status === 'failed' && (
          <View style={[styles.actionArea, { gap: 10 }]}>
            <ShinyButton
              label="RETRY EXPLANATION"
              variant="primary"
              size="lg"
              fullWidth
              icon={<RotateCcw size={16} color={C.textInverse} strokeWidth={2.5} />}
              onPress={handleRetryJob}
            />
            <ShinyButton
              label="CHOOSE ANOTHER FILE"
              variant="secondary"
              size="md"
              fullWidth
              onPress={() => router.push('/(tabs)/upload')}
            />
          </View>
        )}

        {/* Cancel Confirmation Modal */}
        <Modal visible={showCancelModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowCancelModal(false)}>
            <View style={styles.modalContent}>
              <Text variant="headline" rawColor={C.textPrimary} style={{ marginBottom: 6 }}>
                Cancel Generation?
              </Text>
              <Text variant="footnote" rawColor={C.textSecondary} style={{ marginBottom: 16 }}>
                Are you sure you want to cancel? This job will be terminated and processing will stop.
              </Text>
              <View style={styles.modalBtnRow}>
                <Pressable onPress={() => setShowCancelModal(false)} style={styles.modalCancelBtn}>
                  <Text variant="subhead" rawColor={C.textSecondary}>Keep Waiting</Text>
                </Pressable>
                <Pressable onPress={handleConfirmCancel} style={styles.modalConfirmBtn}>
                  <Text variant="subhead" rawColor={C.textInverse} style={{ fontWeight: '700' }}>
                    Yes, Cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#09161B',
  },
  header: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  mascotArea: {
    alignItems: 'center',
    marginVertical: 4,
  },
  currentStepCard: {
    marginBottom: 10,
  },
  currentStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currentStepIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(142, 242, 15, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentStepTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  stuckCard: {
    backgroundColor: 'rgba(255, 214, 0, 0.08)',
    borderColor: 'rgba(255, 214, 0, 0.3)',
    marginBottom: 10,
  },
  stuckRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stuckBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  stuckCancelBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  stuckRetryBtn: {
    backgroundColor: '#FFD600',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  stepsCard: {
    marginBottom: 10,
  },
  stepsTitle: {
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  stepItem: {
    flexDirection: 'row',
    minHeight: 44,
  },
  stepIndicatorCol: {
    alignItems: 'center',
    width: 28,
  },
  stepIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCompleted: {
    backgroundColor: '#8EF20F',
    borderColor: '#8EF20F',
  },
  stepActive: {
    borderColor: '#8EF20F',
  },
  stepLine: {
    width: 1.5,
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    marginVertical: 2,
  },
  stepDetails: {
    flex: 1,
    marginLeft: 8,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  notifyCard: {
    marginBottom: 14,
  },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifyIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionArea: {
    marginTop: 10,
    marginBottom: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0D1E24',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 18,
    padding: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  modalConfirmBtn: {
    backgroundColor: '#FF5252',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
