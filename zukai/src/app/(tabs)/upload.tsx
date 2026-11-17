/**
 * ZUKAI — Upload & Audio Configuration Screen (Phase 7B Compact Polish)
 * Location: /zukai/src/app/(tabs)/upload.tsx
 * Description: File picker, pre-upload validation, concurrent TUS upload,
 *              compact file card, language toggle, 72dp depth cards, pinned CTA.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Zap,
  BookOpen,
  Volume2,
  X,
  ChevronRight,
  Clock,
  ArrowLeft,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { Text } from '@/components/Text';
import { ShinyButton } from '@/components/ShinyButton';
import { Mascot } from '@/components/Mascot';
import { LanguageToggle, Language } from '@/components/LanguageToggle';
import { ProgressBar } from '@/components/ProgressBar';
import { QuotaWarningSheet } from '@/components/QuotaWarningSheet';
import { formatMinutes } from '@/lib/formatMinutes';
import { useUploadStore } from '@/features/upload/uploadManager';
import {
  validatePickedFile,
  checkDuplicateDocument,
  FileMetadata,
  ValidationResult,
} from '@/features/upload/validation';
import { calculateDepthEstimates, estimateSourceWords } from '@/features/upload/estimation';
import { VOICES, VoiceOption, DEFAULT_VOICE_ID } from '@/features/jobs/voicesConfig';
import { useCreateAudioJob } from '@/features/jobs/hooks/useJob';
import { useUsageSummary } from '@/features/usage/hooks/useUsageSummary';
import { useDocuments } from '@/features/documents/hooks/useDocuments';
import { useAuthStore } from '@/lib/authStore';
import { mapRpcError } from '@/lib/rpcErrors';
import { DepthMode } from '@/types/database';

const LAST_OPTIONS_KEY = '@zukai_last_upload_options_v1';

const C = {
  brandHero: '#8EF20F',
  brandVisor: '#0BF807',
  canvasSurfaceRaised: '#12191E',
  canvasSurfaceHighlight: 'rgba(255, 255, 255, 0.08)',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textInverse: '#0B1418',
  success: '#00E676',
  warning: '#FFD600',
  error: '#FF5252',
};

export default function UploadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { data: usageSummary } = useUsageSummary();
  const { data: recentDocs = [] } = useDocuments();
  const createAudioJobMutation = useCreateAudioJob();

  const {
    status: uploadStatus,
    progress: uploadProgress,
    activeDocument,
    file: activeFile,
    errorMessage: uploadError,
    startUpload,
    clearUpload,
  } = useUploadStore();

  // Configuration options state
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    (profile?.preferred_language as Language) || 'english'
  );
  const [selectedDepth, setSelectedDepth] = useState<DepthMode>('standard');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [validationAlert, setValidationAlert] = useState<ValidationResult | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<FileMetadata | null>(null);
  const [showQuotaSheet, setShowQuotaSheet] = useState(false);

  // Restore previous options
  useEffect(() => {
    AsyncStorage.getItem(LAST_OPTIONS_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.language) setSelectedLanguage(parsed.language);
          if (parsed.depth) setSelectedDepth(parsed.depth);
          if (parsed.voiceId) setSelectedVoiceId(parsed.voiceId);
        } catch {}
      }
    });
  }, []);

  // Compute depth estimates
  const depthEstimates = useMemo(() => {
    const rawBytes = activeFile?.size ?? 1024 * 500;
    const estWords = estimateSourceWords(rawBytes, activeFile?.mimeType ?? 'application/pdf');
    return calculateDepthEstimates(estWords);
  }, [activeFile]);

  const chosenEstimate = depthEstimates[selectedDepth];

  // Compute remaining minutes & possible shorter alternatives
  const minutesLeft =
    (usageSummary?.monthly_audio_minutes_limit ?? 45) -
    (usageSummary?.monthly_audio_minutes_used ?? 0);

  const alternativeDepth = useMemo(() => {
    if (selectedDepth === 'deep') {
      if (depthEstimates.standard.estimatedMinutes <= minutesLeft) {
        return {
          mode: 'standard' as DepthMode,
          label: 'Standard Summary',
          estimatedMinutes: depthEstimates.standard.estimatedMinutes,
        };
      } else if (depthEstimates.quick.estimatedMinutes <= minutesLeft) {
        return {
          mode: 'quick' as DepthMode,
          label: 'Quick Breakdown',
          estimatedMinutes: depthEstimates.quick.estimatedMinutes,
        };
      }
    } else if (selectedDepth === 'standard') {
      if (depthEstimates.quick.estimatedMinutes <= minutesLeft) {
        return {
          mode: 'quick' as DepthMode,
          label: 'Quick Breakdown',
          estimatedMinutes: depthEstimates.quick.estimatedMinutes,
        };
      }
    }
    return null;
  }, [selectedDepth, depthEstimates, minutesLeft]);

  // Pick Document Handler
  const handlePickDocument = async () => {
    try {
      setValidationAlert(null);
      setDuplicateWarning(null);

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const pickedFile: FileMetadata = {
        name: asset.name,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        uri: asset.uri,
      };

      // 1. Validate
      const validation = validatePickedFile(pickedFile);
      if (!validation.isValid) {
        setValidationAlert(validation);
        return;
      }

      // 2. Check Duplicates
      const isDup = checkDuplicateDocument(
        pickedFile,
        recentDocs.map((d) => ({
          original_filename: d.original_filename,
          file_size_bytes: d.file_size_bytes,
        }))
      );

      if (isDup) {
        setDuplicateWarning(pickedFile);
        return;
      }

      // 3. Start background upload
      await startUpload(pickedFile);
    } catch (err: any) {
      Alert.alert('File Picker Error', err?.message || 'Failed to select document.');
    }
  };

  const handleProceedDuplicate = async () => {
    if (!duplicateWarning) return;
    const file = duplicateWarning;
    setDuplicateWarning(null);
    await startUpload(file);
  };

  // Submit Job Handler
  const handleCreateAudio = async () => {
    if (!activeDocument) {
      Alert.alert('Upload in Progress', 'Please wait for your document upload to finish.');
      return;
    }

    const chosenEstimate = depthEstimates[selectedDepth];
    if (minutesLeft < chosenEstimate.estimatedMinutes) {
      setShowQuotaSheet(true);
      return;
    }

    try {
      setIsSubmittingJob(true);

      await AsyncStorage.setItem(
        LAST_OPTIONS_KEY,
        JSON.stringify({
          language: selectedLanguage,
          depth: selectedDepth,
          voiceId: selectedVoiceId,
        })
      );

      const job = await createAudioJobMutation.mutateAsync({
        documentId: activeDocument.id,
        language: selectedLanguage,
        depth: selectedDepth,
        voice: selectedVoiceId,
      });

      clearUpload();
      router.push(`/processing/${job.id}` as any);
    } catch (err: any) {
      const friendlyError = mapRpcError(err);
      Alert.alert(friendlyError.title, friendlyError.message);
    } finally {
      setIsSubmittingJob(false);
    }
  };

  // State A: Idle Picker View (with Tab Bar)
  if (!activeFile && uploadStatus === 'idle') {
    return (
      <ScreenContainer meshVariant="upload" hasTabBar>
        <Text variant="headline" rawColor={C.textPrimary} style={styles.title}>
          Upload Document
        </Text>
        <Text variant="subhead" rawColor={C.textSecondary} style={styles.sub}>
          Turn any PDF or Word doc into an audio explanation
        </Text>

        <View style={styles.mascotWrap}>
          <Mascot pose="welcome" size={130} animated />
        </View>

        {/* Validation Alert */}
        {validationAlert && (
          <GlassCard style={styles.alertCard} padding={12} borderRadius={14}>
            <View style={styles.alertHeader}>
              <AlertTriangle size={16} color={C.error} />
              <Text variant="headline" rawColor={C.error} style={{ fontSize: 13 }}>
                {validationAlert.title}
              </Text>
            </View>
            <Text variant="footnote" rawColor={C.textSecondary} style={{ marginTop: 4 }}>
              {validationAlert.message}
            </Text>
            <Pressable onPress={() => setValidationAlert(null)} style={styles.dismissAlertBtn}>
              <Text variant="caption" rawColor={C.brandHero}>Dismiss</Text>
            </Pressable>
          </GlassCard>
        )}

        {/* Duplicate Warning */}
        {duplicateWarning && (
          <GlassCard style={styles.warningCard} padding={12} borderRadius={14}>
            <View style={styles.alertHeader}>
              <AlertTriangle size={16} color={C.warning} />
              <Text variant="headline" rawColor={C.warning} style={{ fontSize: 13 }}>
                Duplicate Document
              </Text>
            </View>
            <Text variant="footnote" rawColor={C.textSecondary} style={{ marginTop: 4 }}>
              You recently uploaded a document with the same name ("{duplicateWarning.name}").
            </Text>
            <View style={styles.dupBtnRow}>
              <Pressable onPress={() => setDuplicateWarning(null)} style={styles.dupCancelBtn}>
                <Text variant="footnote" rawColor={C.textSecondary}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleProceedDuplicate} style={styles.dupProceedBtn}>
                <Text variant="footnote" rawColor={C.textInverse} style={{ fontWeight: '700' }}>
                  Upload Anyway
                </Text>
              </Pressable>
            </View>
          </GlassCard>
        )}

        {/* Dropzone Card */}
        <Pressable onPress={handlePickDocument} style={styles.dropZone}>
          <View style={styles.dropZoneIconCircle}>
            <UploadCloud size={28} color={C.brandHero} strokeWidth={2.2} />
          </View>
          <Text variant="headline" rawColor={C.textPrimary} style={{ marginTop: 6, fontSize: 15 }}>
            Tap to select document
          </Text>
          <Text variant="caption" rawColor={C.textTertiary}>
            PDF, DOCX, PPTX, TXT • Up to 50MB
          </Text>
        </Pressable>

        {/* Format Pills */}
        <View style={styles.formatsRow}>
          {['PDF', 'DOCX', 'PPTX', 'TXT'].map((f) => (
            <View key={f} style={styles.formatPill}>
              <Text variant="caption" rawColor={C.textSecondary} style={{ fontWeight: '700', fontSize: 10 }}>
                {f}
              </Text>
            </View>
          ))}
        </View>

        {/* Primary CTA */}
        <ShinyButton
          label="SELECT DOCUMENT"
          variant="primary"
          size="lg"
          fullWidth
          icon={<UploadCloud size={18} color={C.textInverse} strokeWidth={2.5} />}
          onPress={handlePickDocument}
          style={styles.cta}
        />

        {/* Quota Row */}
        <View style={styles.quotaRow}>
          <Text variant="footnote" rawColor={C.textTertiary}>
            Audio remaining:{' '}
            <Text variant="footnote" rawColor={C.brandHero} style={{ fontWeight: '700' }}>
              {formatMinutes(Math.max(0, minutesLeft))}
            </Text>
            {' '}this month •{' '}
          </Text>
          <Pressable onPress={() => router.push('/paywall' as any)}>
            <Text variant="footnote" rawColor={C.brandHero} style={{ fontWeight: '700' }}>
              Upgrade Plan
            </Text>
          </Pressable>
        </View>

        <QuotaWarningSheet
          visible={showQuotaSheet}
          minutesRemaining={minutesLeft}
          neededMinutes={chosenEstimate.estimatedMinutes}
          currentDepth={selectedDepth}
          alternativeDepth={alternativeDepth}
          onSelectAlternative={(mode) => {
            setSelectedDepth(mode);
            setShowQuotaSheet(false);
          }}
          onUpgrade={() => {
            setShowQuotaSheet(false);
            router.push('/paywall' as any);
          }}
          onDismiss={() => setShowQuotaSheet(false)}
        />
      </ScreenContainer>
    );
  }

  // State B: Active File Uploading / Configure Audio Flow (TAB BAR HIDDEN)
  const isUploading =
    uploadStatus === 'uploading' ||
    uploadStatus === 'preparing' ||
    uploadStatus === 'completing';
  const isCompleted = uploadStatus === 'completed';
  const isFailed = uploadStatus === 'failed';

  const fileSizeMb = activeFile ? (activeFile.size / (1024 * 1024)).toFixed(1) : '0';
  const speedKbps = Math.round(uploadProgress.speedBytesPerSec / 1024);

  return (
    <View style={styles.root}>
      <ScreenContainer meshVariant="upload" hasTabBar={false}>
        {/* Header with Back to Cancel */}
        <View style={styles.configureHeader}>
          <Pressable onPress={clearUpload} hitSlop={12} style={styles.backBtn}>
            <ArrowLeft size={20} color={C.textSecondary} strokeWidth={2.2} />
          </Pressable>
          <Text variant="headline" rawColor={C.textPrimary} style={{ fontWeight: '800' }}>
            Configure Audio
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* 1. Compact File Card with Chunky ProgressBar */}
        <GlassCard style={styles.fileCard} padding={10} borderRadius={14}>
          <View style={styles.fileRow}>
            <View style={styles.fileIconWrap}>
              <FileText size={20} color={C.brandHero} strokeWidth={2.2} />
            </View>
            <View style={styles.fileDetails}>
              <Text variant="subhead" rawColor={C.textPrimary} numberOfLines={1} style={{ fontWeight: '700' }}>
                {activeFile?.name || 'Document'}
              </Text>
              <Text variant="caption" rawColor={C.textTertiary}>
                {fileSizeMb} MB • {activeFile?.name.split('.').pop()?.toUpperCase()}
              </Text>
            </View>
            <Pressable onPress={clearUpload} hitSlop={8} style={styles.fileRemoveBtn}>
              <X size={16} color={C.textTertiary} />
            </Pressable>
          </View>

          {/* Upload Progress */}
          <View style={styles.uploadProgressSection}>
            <ProgressBar
              progress={isCompleted ? 100 : uploadProgress.percent}
              height={10}
            />
            <View style={styles.uploadProgressTextRow}>
              <Text
                variant="caption"
                rawColor={isFailed ? C.error : isCompleted ? C.success : C.textTertiary}
                style={{ fontSize: 10, fontWeight: '600' }}
              >
                {isCompleted
                  ? 'Upload complete ✓'
                  : isFailed
                  ? `Upload failed: ${uploadError || 'Network error'}`
                  : `Uploading ${uploadProgress.percent}% (${speedKbps} KB/s)`}
              </Text>
              {isFailed && (
                <Pressable
                  onPress={() => activeFile && startUpload(activeFile)}
                  style={styles.retryUploadBtn}
                >
                  <RotateCcw size={12} color={C.brandHero} />
                  <Text variant="caption" rawColor={C.brandHero}>Retry</Text>
                </Pressable>
              )}
            </View>
          </View>
        </GlassCard>

        {/* 2. Full-Width Language Selector */}
        <View style={styles.section}>
          <Text variant="subhead" rawColor={C.textPrimary} style={styles.sectionTitle}>
            Language
          </Text>
          <LanguageToggle value={selectedLanguage} onChange={setSelectedLanguage} />
        </View>

        {/* 3. Compact Depth Cards (~72dp each) */}
        <View style={styles.section}>
          <Text variant="subhead" rawColor={C.textPrimary} style={styles.sectionTitle}>
            Explanation Depth
          </Text>
          <View style={styles.depthList}>
            {(['quick', 'standard', 'deep'] as DepthMode[]).map((mode) => {
              const estimate = depthEstimates[mode];
              const isSelected = selectedDepth === mode;
              const title = mode === 'quick' ? 'Quick Breakdown' : mode === 'standard' ? 'Standard Summary' : 'Deep Dive';
              const subtitle = mode === 'quick' ? 'Core takeaways only' : mode === 'standard' ? 'Clear concepts & examples' : 'Comprehensive coverage';

              return (
                <Pressable
                  key={mode}
                  onPress={() => setSelectedDepth(mode)}
                  style={[styles.depthCardWrap, isSelected && styles.depthCardSelected]}
                >
                  <GlassCard style={styles.depthCard} padding={10} borderRadius={12}>
                    <View style={styles.depthRow}>
                      <View style={[styles.radioCircle, isSelected && styles.radioSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                      <View style={styles.depthTextCol}>
                        <Text variant="subhead" rawColor={isSelected ? C.brandHero : C.textPrimary} style={{ fontWeight: '700' }}>
                          {title}
                        </Text>
                        <Text variant="caption" rawColor={C.textTertiary}>
                          {subtitle}
                        </Text>
                      </View>
                      <View style={styles.estPill}>
                        <Clock size={11} color={C.brandHero} />
                        <Text variant="caption" rawColor={C.brandHero} style={{ fontWeight: '700', fontSize: 10 }}>
                          ~{estimate.estimatedMinutes}m
                        </Text>
                      </View>
                    </View>
                  </GlassCard>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 4. Voice Picker Pills */}
        <View style={styles.section}>
          <Text variant="subhead" rawColor={C.textPrimary} style={styles.sectionTitle}>
            AI Voice
          </Text>
          <View style={styles.voiceRow}>
            {VOICES.map((v) => {
              const isSelected = selectedVoiceId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setSelectedVoiceId(v.id)}
                  style={[styles.voicePill, isSelected && styles.voicePillActive]}
                >
                  <Volume2 size={13} color={isSelected ? C.textInverse : C.textSecondary} />
                  <Text
                    variant="caption"
                    rawColor={isSelected ? C.textInverse : C.textSecondary}
                    style={{ fontWeight: '700', fontSize: 11 }}
                  >
                    {v.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Pinned Bottom Primary CTA */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          <ShinyButton
            label={isSubmittingJob ? 'CREATING AUDIO...' : 'CREATE AUDIO EXPLANATION'}
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmittingJob}
            disabled={!isCompleted || isSubmittingJob}
            icon={<Sparkles size={18} color={C.textInverse} strokeWidth={2.5} />}
            onPress={handleCreateAudio}
          />
        </View>

        <QuotaWarningSheet
          visible={showQuotaSheet}
          minutesRemaining={minutesLeft}
          neededMinutes={chosenEstimate.estimatedMinutes}
          currentDepth={selectedDepth}
          alternativeDepth={alternativeDepth}
          onSelectAlternative={(mode) => {
            setSelectedDepth(mode);
            setShowQuotaSheet(false);
          }}
          onUpgrade={() => {
            setShowQuotaSheet(false);
            router.push('/paywall' as any);
          }}
          onDismiss={() => setShowQuotaSheet(false)}
        />
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#09161B',
  },
  title: {
    fontWeight: '800',
    fontSize: 20,
    marginTop: 4,
  },
  sub: {
    marginTop: 2,
    marginBottom: 10,
    fontSize: 13,
  },
  mascotWrap: {
    alignItems: 'center',
    marginVertical: 4,
  },
  dropZone: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(142, 242, 15, 0.4)',
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 24,
    backgroundColor: 'rgba(142, 242, 15, 0.05)',
    marginTop: 10,
    marginBottom: 10,
  },
  dropZoneIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(142, 242, 15, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  formatPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cta: {
    marginBottom: 12,
  },
  quotaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertCard: {
    marginBottom: 10,
    backgroundColor: 'rgba(255, 82, 82, 0.08)',
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dismissAlertBtn: {
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  warningCard: {
    marginBottom: 10,
    backgroundColor: 'rgba(255, 214, 0, 0.08)',
    borderColor: 'rgba(255, 214, 0, 0.3)',
  },
  dupBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  dupCancelBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dupProceedBtn: {
    backgroundColor: '#FFD600',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  configureHeader: {
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
  fileCard: {
    marginBottom: 12,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(142, 242, 15, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  fileRemoveBtn: {
    padding: 6,
  },
  uploadProgressSection: {
    marginTop: 8,
  },
  uploadProgressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  retryUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  depthList: {
    gap: 6,
  },
  depthCardWrap: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  depthCardSelected: {
    borderColor: '#8EF20F',
  },
  depthCard: {
    height: 64,
    justifyContent: 'center',
  },
  depthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#8EF20F',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8EF20F',
  },
  depthTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  estPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  voiceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  voicePill: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 999,
    gap: 6,
  },
  voicePillActive: {
    backgroundColor: '#8EF20F',
    borderColor: '#8EF20F',
  },
  bottomBar: {
    marginTop: 12,
  },
});
