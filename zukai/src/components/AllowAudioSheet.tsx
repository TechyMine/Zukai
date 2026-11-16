/**
 * ZUKAI ALLOW AUDIO FIRST-PLAY SHEET
 * Honest "speaker & playback controls" disclosure bottom sheet displayed
 * the first time the user initiates audio playback.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Volume2, Bell, Check, X } from 'lucide-react-native';
import { GlassCard } from './GlassCard';
import { Text } from './Text';
import { Mascot } from './Mascot';
import { ShinyButton } from './ShinyButton';

const ALLOW_AUDIO_SHOWN_KEY = '@zukai_allow_audio_sheet_v1';

export interface AllowAudioSheetProps {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}

export function AllowAudioSheet({
  visible,
  onAllow,
  onDismiss,
}: AllowAudioSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <GlassCard style={styles.card} padding={18} borderRadius={24}>
          <View style={styles.headerIcon}>
            <Volume2 size={24} color="#8EF20F" strokeWidth={2.5} />
          </View>

          <Mascot pose="listening" size={100} animated />

          <Text variant="title3" rawColor="#F4F7F2" style={styles.title}>
            Allow Audio & Lockscreen Controls
          </Text>

          <Text variant="subhead" rawColor="#A2B4BE" style={styles.body}>
            Zukai plays crystal-clear speech breakdowns in background and shows media controls on your lockscreen and notifications shade.
          </Text>

          <View style={styles.featureRow}>
            <View style={styles.checkIcon}>
              <Check size={12} color="#0B1418" strokeWidth={3} />
            </View>
            <Text variant="footnote" rawColor="#F4F7F2" style={{ flex: 1 }}>
              Lockscreen and Bluetooth headset playback controls
            </Text>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.checkIcon}>
              <Check size={12} color="#0B1418" strokeWidth={3} />
            </View>
            <Text variant="footnote" rawColor="#F4F7F2" style={{ flex: 1 }}>
              Alert when newly queued documents finish synthesizing
            </Text>
          </View>

          <View style={styles.buttonGroup}>
            <ShinyButton
              label="ALLOW & START AUDIO"
              variant="primary"
              size="lg"
              fullWidth
              onPress={onAllow}
            />
            <Pressable onPress={onDismiss} style={styles.secondaryBtn} hitSlop={10}>
              <Text variant="subhead" rawColor="#A2B4BE">
                Not now, just play audio
              </Text>
            </Pressable>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

/**
 * Hook to manage the first-play allow audio sheet.
 */
export function useAllowAudio() {
  const [shouldShow, setShouldShow] = useState(false);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  const checkAndRun = async (playCallback: () => void) => {
    try {
      const shown = await AsyncStorage.getItem(ALLOW_AUDIO_SHOWN_KEY);
      if (!shown) {
        setPendingCallback(() => playCallback);
        setShouldShow(true);
        return;
      }
    } catch {}
    playCallback();
  };

  const handleAllow = async () => {
    try {
      await AsyncStorage.setItem(ALLOW_AUDIO_SHOWN_KEY, 'true');
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
      }
    } catch {}
    setShouldShow(false);
    pendingCallback?.();
    setPendingCallback(null);
  };

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(ALLOW_AUDIO_SHOWN_KEY, 'true');
    } catch {}
    setShouldShow(false);
    pendingCallback?.();
    setPendingCallback(null);
  };

  return {
    isSheetVisible: shouldShow,
    checkAndRun,
    handleAllow,
    handleDismiss,
  };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 13, 16, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(142, 242, 15, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    fontWeight: '800',
  },
  body: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingHorizontal: 8,
  },
  checkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#8EF20F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGroup: {
    width: '100%',
    marginTop: 8,
    gap: 10,
    alignItems: 'center',
  },
  secondaryBtn: {
    paddingVertical: 8,
  },
});
