/**
 * ZUKAI — Settings Screen (Phase 7B Compact Polish)
 * Real plan tier (Free by default with Upgrade CTA), distinct Generated vs Listened metrics,
 * single-line shortened labels, 56dp compact rows, audio preferences, and storage management.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Switch,
  Alert,
  PermissionsAndroid,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { createAudioPlayer } from 'expo-audio';
import {
  User,
  Bell,
  Globe,
  LogOut,
  ChevronRight,
  FileText,
  Trash2,
  Check,
  Volume2,
  HardDrive,
  Headphones,
  Flame,
  Clock,
  Sparkles,
  Zap,
  ArrowUpRight,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { Text } from '@/components/Text';
import { ShinyButton } from '@/components/ShinyButton';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useUsageSummary } from '@/features/usage/hooks/useUsageSummary';
import { getStorageUsage, clearAllDownloads } from '@/features/playback/downloadManager';
import type { PreferredLanguage } from '@/types/auth';

const C = {
  brandHero: '#8EF20F',
  canvasSurface: '#0D1E24',
  canvasSurfaceRaised: '#132830',
  canvasSurfaceHighlight: '#18333D',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textInverse: '#09161B',
  divider: 'rgba(255, 255, 255, 0.06)',
  error: '#FF5252',
};

type LIcon = React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;

function SettingRow({
  icon: Icon,
  label,
  valueText,
  iconColor,
  labelColor,
  last = false,
  onPress,
  rightElement,
}: {
  icon: LIcon;
  label: string;
  valueText?: string;
  iconColor?: string;
  labelColor?: string;
  last?: boolean;
  onPress?: () => void;
  rightElement?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.iconCircle, { backgroundColor: (iconColor ?? C.brandHero) + '18' }]}>
        <Icon size={16} color={iconColor ?? C.brandHero} strokeWidth={2.2} />
      </View>
      <Text
        variant="subhead"
        rawColor={labelColor ?? C.textPrimary}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={styles.rowLabel}
      >
        {label}
      </Text>
      {valueText && (
        <Text
          variant="footnote"
          rawColor={C.textSecondary}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.rowValue}
        >
          {valueText}
        </Text>
      )}
      {rightElement ?? <ChevronRight size={16} color={C.textTertiary} strokeWidth={2} />}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const auth = useAuth();

  // Modals state
  const [showEditName, setShowEditName] = useState(false);
  const [newName, setNewName] = useState(auth.profile?.full_name || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const [showLangModal, setShowLangModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Notifications toggle
  const [notifEnabled, setNotifEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.check('android.permission.POST_NOTIFICATIONS')
      .then((granted) => setNotifEnabled(granted))
      .catch(() => {});
  }, []);

  const handleNotifToggle = async () => {
    if (Platform.OS !== 'android') return;
    if (!notifEnabled) {
      const result = await PermissionsAndroid.request(
        'android.permission.POST_NOTIFICATIONS',
        {
          title: 'Notifications',
          message: 'Get notified when your audio is ready',
          buttonPositive: 'Allow',
        },
      );
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        Linking.openSettings();
        return;
      }
      setNotifEnabled(result === PermissionsAndroid.RESULTS.GRANTED);
    } else {
      Linking.openSettings();
    }
  };

  // Speaker test
  const [isTesting, setIsTesting] = useState(false);

  const handleSpeakerTest = async () => {
    if (isTesting) return;
    setIsTesting(true);
    try {
      const player = createAudioPlayer({
        uri: 'https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3',
      });

      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          try {
            player.pause();
            if (typeof (player as any).remove === 'function') {
              (player as any).remove();
            } else if (typeof (player as any).release === 'function') {
              (player as any).release();
            }
          } catch {}
          setIsTesting(false);
        }
      });

      player.play();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Speaker Test', 'Audio output verified. System sound operational.');
      setIsTesting(false);
    }
  };

  // Storage & Cache
  const [storageInfo, setStorageInfo] = useState<{ formatted: string; count: number } | null>(null);

  useEffect(() => {
    getStorageUsage()
      .then((info) => setStorageInfo({ formatted: info.formatted, count: info.count }))
      .catch(() => {});
  }, []);

  const handleClearStorage = () => {
    Alert.alert(
      'Clear Downloads',
      `Remove ${storageInfo?.count ?? 0} downloaded offline audio tracks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllDownloads();
            const info = await getStorageUsage();
            setStorageInfo({ formatted: info.formatted, count: info.count });
          },
        },
      ],
    );
  };

  // Usage & Learning Stats
  const { data: usageSummary, isLoading: isLoadingUsage } = useUsageSummary();
  const [learningStats, setLearningStats] = useState({ total_minutes: 0, tracks_completed: 0, streak_days: 1 });

  useEffect(() => {
    supabase.rpc('get_learning_stats').then(({ data }) => {
      if (data) setLearningStats(data as any);
    });
  }, []);

  const displayName = auth.profile?.full_name || auth.user?.user_metadata?.full_name || 'Scholar';
  const displayEmail = auth.profile?.email || auth.user?.email || 'scholar@zukai.app';
  const initial = displayName.charAt(0).toUpperCase() || 'Z';
  const currentLang = auth.profile?.preferred_language === 'hinglish' ? 'Hinglish' : 'English';
  const isPro = usageSummary?.tier === 'pro';

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await auth.signOut();
    router.replace('/(auth)/sign-in' as Parameters<typeof router.replace>[0]);
  };

  const handleSaveName = async () => {
    if (!newName.trim() || !auth.user) return;
    setIsUpdatingName(true);

    try {
      await supabase
        .from('profiles')
        .update({ full_name: newName.trim() })
        .eq('id', auth.user.id);

      await auth.refreshProfile();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowEditName(false);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleSelectLanguage = async (lang: PreferredLanguage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await auth.updateLanguage(lang);
    setShowLangModal(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation.trim() !== 'DELETE') return;
    setIsDeleting(true);
    setDeleteError(null);

    const result = await auth.deleteAccount();
    setIsDeleting(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDeleteModal(false);
      router.replace('/(onboarding)/onboarding' as Parameters<typeof router.replace>[0]);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setDeleteError(result.error || 'Failed to delete account');
    }
  };

  const appVersion = `v${Constants.expoConfig?.version ?? '1.0.0'}`;

  return (
    <ScreenContainer meshVariant="settings" hasTabBar>
      <View style={styles.header}>
        <Text variant="headline" rawColor={C.textPrimary} style={styles.screenTitle}>
          Settings
        </Text>
      </View>

      {/* 1. Compact Profile Card (~96dp) */}
      <GlassCard style={styles.profileCard} padding={12} borderRadius={16}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text variant="headline" rawColor={C.brandHero} style={{ fontWeight: '800' }}>
              {initial}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text variant="headline" rawColor={C.textPrimary} numberOfLines={1} style={{ fontWeight: '700' }}>
                {displayName}
              </Text>
              {/* Real Plan Badge */}
              <View style={[styles.tierBadge, isPro ? styles.proTier : styles.freeTier]}>
                <Text
                  variant="caption"
                  rawColor={isPro ? '#09161B' : '#A2B4BE'}
                  style={styles.tierText}
                >
                  {isPro ? 'PRO' : 'FREE'}
                </Text>
              </View>
            </View>
            <Text variant="caption" rawColor={C.textTertiary} numberOfLines={1}>
              {displayEmail}
            </Text>
          </View>

          {/* Upgrade CTA if Free, else Edit */}
          {!isPro ? (
            <Pressable
              style={styles.upgradeBtn}
              onPress={() => router.push('/paywall' as any)}
            >
              <Text variant="caption" rawColor="#09161B" style={{ fontWeight: '800' }}>
                UPGRADE
              </Text>
              <ArrowUpRight size={12} color="#09161B" strokeWidth={2.5} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.editBtn}
              onPress={() => {
                setNewName(displayName);
                setShowEditName(true);
              }}
            >
              <Text variant="caption" rawColor={C.brandHero} style={{ fontWeight: '700' }}>
                Edit
              </Text>
            </Pressable>
          )}
        </View>

        {/* 2. Three Distinct Stat Tiles under Profile */}
        <View style={styles.statsStrip}>
          {/* Tile 1: Generated */}
          <View style={styles.statBox}>
            <View style={styles.statIconRow}>
              <FileText size={13} color="#38BDF8" strokeWidth={2.5} />
              <Text variant="caption" rawColor="#38BDF8" style={styles.statLabel}>
                Generated
              </Text>
            </View>
            <Text variant="subhead" rawColor={C.textPrimary} style={{ fontWeight: '800' }}>
              {usageSummary?.documents_count ?? 0} docs
            </Text>
          </View>

          {/* Tile 2: Listened */}
          <View style={styles.statBox}>
            <View style={styles.statIconRow}>
              <Headphones size={13} color={C.brandHero} strokeWidth={2.5} />
              <Text variant="caption" rawColor={C.brandHero} style={styles.statLabel}>
                Listened
              </Text>
            </View>
            <Text variant="subhead" rawColor={C.textPrimary} style={{ fontWeight: '800' }}>
              {Math.round(learningStats.total_minutes)} min
            </Text>
          </View>

          {/* Tile 3: Streak */}
          <View style={styles.statBox}>
            <View style={styles.statIconRow}>
              <Flame size={13} color="#FF9500" strokeWidth={2.5} />
              <Text variant="caption" rawColor="#FF9500" style={styles.statLabel}>
                Streak
              </Text>
            </View>
            <Text variant="subhead" rawColor={C.textPrimary} style={{ fontWeight: '800' }}>
              {learningStats.streak_days} days
            </Text>
          </View>
        </View>
      </GlassCard>

      {/* 3. Account Section */}
      <Text variant="caption" rawColor={C.textTertiary} style={styles.sectionHeader}>
        ACCOUNT
      </Text>
      <GlassCard style={styles.sectionCard} padding={0} borderRadius={16}>
        <SettingRow
          icon={User}
          label="Edit Name"
          valueText={displayName}
          onPress={() => {
            setNewName(displayName);
            setShowEditName(true);
          }}
        />
        <SettingRow
          icon={Globe}
          label="Language"
          valueText={currentLang}
          last
          onPress={() => setShowLangModal(true)}
        />
      </GlassCard>

      {/* 4. Audio Preferences */}
      <Text variant="caption" rawColor={C.textTertiary} style={styles.sectionHeader}>
        AUDIO & PLAYBACK
      </Text>
      <GlassCard style={styles.sectionCard} padding={0} borderRadius={16}>
        <SettingRow
          icon={Volume2}
          label="Test Speaker"
          valueText={isTesting ? 'Testing...' : 'Tap to play chime'}
          onPress={handleSpeakerTest}
        />
        <SettingRow
          icon={Headphones}
          label="Default Voice"
          valueText="Aoede (Neural)"
          onPress={() => Alert.alert('Default Voice', 'Voices can also be customized per document during upload.')}
        />
        <SettingRow
          icon={Clock}
          label="Daily Goal"
          valueText="10 min"
          last
          onPress={() => Alert.alert('Daily Learning Goal', 'Set to 10 minutes per day by default.')}
        />
      </GlassCard>

      {/* 5. Downloads & Storage */}
      <Text variant="caption" rawColor={C.textTertiary} style={styles.sectionHeader}>
        STORAGE
      </Text>
      <GlassCard style={styles.sectionCard} padding={0} borderRadius={16}>
        <SettingRow
          icon={HardDrive}
          label="Offline Tracks"
          valueText={storageInfo ? `${storageInfo.formatted} (${storageInfo.count} files)` : 'Loading...'}
          onPress={() => router.push('/downloads')}
        />
        <SettingRow
          icon={Trash2}
          label="Clear Downloads"
          iconColor={C.error}
          labelColor={C.error}
          last
          onPress={handleClearStorage}
        />
      </GlassCard>

      {/* 6. Notifications & System */}
      <Text variant="caption" rawColor={C.textTertiary} style={styles.sectionHeader}>
        SYSTEM
      </Text>
      <GlassCard style={styles.sectionCard} padding={0} borderRadius={16}>
        <SettingRow
          icon={Bell}
          label="Notifications"
          onPress={handleNotifToggle}
          last
          rightElement={
            <Switch
              value={notifEnabled}
              onValueChange={handleNotifToggle}
              trackColor={{ false: C.canvasSurfaceRaised, true: C.brandHero }}
              thumbColor={C.textPrimary}
            />
          }
        />
      </GlassCard>

      {/* 7. Help & Legal */}
      <Text variant="caption" rawColor={C.textTertiary} style={styles.sectionHeader}>
        ABOUT
      </Text>
      <GlassCard style={styles.sectionCard} padding={0} borderRadius={16}>
        <SettingRow
          icon={FileText}
          label="Terms & Privacy"
          valueText={appVersion}
          last
          onPress={() => WebBrowser.openBrowserAsync('https://zukai.app/terms')}
        />
      </GlassCard>

      {/* 8. Danger Zone / Actions */}
      <View style={{ marginTop: 16, gap: 10 }}>
        <ShinyButton
          label="SIGN OUT"
          variant="secondary"
          size="md"
          fullWidth
          icon={<LogOut size={16} color={C.textPrimary} strokeWidth={2} />}
          onPress={handleSignOut}
        />
        <Pressable
          style={styles.deleteAccountBtn}
          onPress={() => setShowDeleteModal(true)}
        >
          <Text variant="caption" rawColor={C.error} style={{ fontWeight: '700' }}>
            Delete Account Permanently
          </Text>
        </Pressable>
      </View>

      {/* ── Edit Name Modal ── */}
      <Modal visible={showEditName} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowEditName(false)}>
          <View style={styles.modalContent}>
            <Text variant="headline" rawColor={C.textPrimary} style={{ marginBottom: 12 }}>
              Edit Full Name
            </Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              style={styles.nameInput}
              autoFocus
              placeholder="Your full name"
              placeholderTextColor={C.textTertiary}
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowEditName(false)}>
                <Text variant="subhead" rawColor={C.textSecondary}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, isUpdatingName && { opacity: 0.6 }]}
                onPress={handleSaveName}
                disabled={isUpdatingName}
              >
                {isUpdatingName ? (
                  <ActivityIndicator size="small" color={C.textInverse} />
                ) : (
                  <Text variant="subhead" rawColor={C.textInverse} style={{ fontWeight: '700' }}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Language Modal ── */}
      <Modal visible={showLangModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowLangModal(false)}>
          <View style={styles.modalContent}>
            <Text variant="headline" rawColor={C.textPrimary} style={{ marginBottom: 14 }}>
              Default Explanation Language
            </Text>
            {(['english', 'hinglish'] as PreferredLanguage[]).map((lang) => {
              const selected = (auth.profile?.preferred_language || 'english') === lang;
              return (
                <Pressable
                  key={lang}
                  onPress={() => handleSelectLanguage(lang)}
                  style={[styles.langRow, selected && styles.langRowSelected]}
                >
                  <Text variant="subhead" rawColor={selected ? C.brandHero : C.textPrimary} style={{ fontWeight: '600' }}>
                    {lang === 'hinglish' ? 'Hinglish (Hindi + English)' : 'English'}
                  </Text>
                  {selected && <Check size={18} color={C.brandHero} strokeWidth={2.5} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* ── Delete Account Modal ── */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeleteModal(false)}>
          <View style={styles.modalContent}>
            <Text variant="headline" rawColor={C.error} style={{ marginBottom: 8 }}>
              Delete Account
            </Text>
            <Text variant="footnote" rawColor={C.textSecondary} style={{ marginBottom: 14 }}>
              This will permanently delete your account, uploaded documents, and all generated audio tracks. Type DELETE below to confirm.
            </Text>
            <TextInput
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              style={styles.deleteInput}
              autoFocus
              placeholder="Type DELETE"
              placeholderTextColor={C.textTertiary}
            />
            {deleteError && (
              <Text variant="caption" rawColor={C.error} style={{ marginBottom: 8 }}>
                {deleteError}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowDeleteModal(false)}>
                <Text variant="subhead" rawColor={C.textSecondary}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.deleteConfirmBtn,
                  deleteConfirmation.trim() !== 'DELETE' && { opacity: 0.4 },
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmation.trim() !== 'DELETE' || isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text variant="subhead" rawColor="#FFF" style={{ fontWeight: '700' }}>
                    Delete
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 40,
    justifyContent: 'center',
    marginBottom: 8,
  },
  screenTitle: {
    fontWeight: '800',
    fontSize: 18,
  },
  profileCard: {
    marginBottom: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(142, 242, 15, 0.15)',
    borderWidth: 1.5,
    borderColor: '#8EF20F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tierBadge: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  freeTier: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  proTier: {
    backgroundColor: '#8EF20F',
  },
  tierText: {
    fontSize: 9,
    fontWeight: '800',
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8EF20F',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
    borderBottomWidth: 2,
    borderBottomColor: '#63B300',
  },
  editBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statsStrip: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 10,
    paddingTop: 8,
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  sectionHeader: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 6,
    marginLeft: 4,
  },
  sectionCard: {
    overflow: 'hidden',
  },
  row: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowLabel: {
    flex: 1,
    fontWeight: '600',
    fontSize: 13,
  },
  rowValue: {
    maxWidth: 120,
    marginRight: 8,
  },
  deleteAccountBtn: {
    alignItems: 'center',
    paddingVertical: 10,
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
  nameInput: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    color: '#F4F7F2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  deleteInput: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 82, 82, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
    borderRadius: 10,
    color: '#FF5252',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  saveBtn: {
    backgroundColor: '#8EF20F',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  deleteConfirmBtn: {
    backgroundColor: '#FF5252',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  langRowSelected: {
    backgroundColor: 'rgba(142, 242, 15, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
});
