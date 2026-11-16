/**
 * ZUKAI SCREEN CONTAINER
 * Centralized layout container ensuring consistent padding, safe areas,
 * background mesh, status-bar scrim, and guaranteed bottom clearance above floating tab bar and mini-player.
 */

import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  StyleProp,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MeshBackground } from './MeshBackground';
import { usePlaybackStore } from '@/features/playback/playbackStore';

type MeshVariant = Parameters<typeof MeshBackground>[0]['variant'];

export interface ScreenContainerProps {
  children: React.ReactNode;
  meshVariant?: MeshVariant;
  scrollable?: boolean;
  hasTabBar?: boolean;
  noTopPadding?: boolean;
  noHorizontalPadding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
}

export function ScreenContainer({
  children,
  meshVariant = 'home',
  scrollable = true,
  hasTabBar = false,
  noTopPadding = false,
  noHorizontalPadding = false,
  contentContainerStyle,
  style,
  keyboardAvoiding = false,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const hasMiniPlayer = usePlaybackStore((s) => Boolean(s.activeTrack));

  // Compute calculated bottom inset so content is never hidden behind floating tab bar or mini-player
  const TAB_BAR_HEIGHT = 68;
  const MINI_PLAYER_HEIGHT = 66;

  const bottomInset =
    (hasTabBar ? TAB_BAR_HEIGHT + insets.bottom + 12 : insets.bottom + 20) +
    (hasMiniPlayer && hasTabBar ? MINI_PLAYER_HEIGHT + 10 : 0) +
    24; // Extra clearance ensuring last item is always comfortably reachable above tab bar

  const topInset = noTopPadding ? 0 : insets.top + 16;
  const horizontalPadding = noHorizontalPadding ? 0 : 16; // 16dp compact token

  const resolvedContentStyle: StyleProp<ViewStyle> = [
    styles.defaultContent,
    {
      paddingTop: topInset,
      paddingBottom: bottomInset,
      paddingHorizontal: horizontalPadding,
    },
    contentContainerStyle,
  ];

  const body = scrollable ? (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={resolvedContentStyle}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, resolvedContentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, style]}>
      <MeshBackground variant={meshVariant} />

      {/* Subtle status-bar scrim gradient so scrolled content doesn't collide with status bar clock/icons */}
      <LinearGradient
        colors={['rgba(9, 22, 27, 0.95)', 'rgba(9, 22, 27, 0.65)', 'transparent']}
        locations={[0, 0.65, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[
          styles.statusBarScrim,
          { height: insets.top + 20 },
        ]}
        pointerEvents="none"
      />

      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.fill}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#09161B',
    position: 'relative',
  },
  fill: {
    flex: 1,
  },
  defaultContent: {
    flexGrow: 1,
  },
  statusBarScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
});
