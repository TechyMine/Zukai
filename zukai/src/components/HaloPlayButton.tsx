/**
 * ZUKAI HALO PLAY BUTTON (Phase UI-V2)
 * Round play button with an outer halo ring (like the reference's mic button).
 * The outer ring gently pulses while audio plays.
 */

import React, { useEffect, useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  cancelAnimation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Pause } from 'lucide-react-native';

let Haptics: { impactAsync: (style: string) => Promise<void> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch {}

export interface HaloPlayButtonProps {
  isPlaying: boolean;
  onPress: () => void;
  size?: number; // Core button diameter, default 60
  ringOffset?: number; // Ring spacing, default 8
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function HaloPlayButton({
  isPlaying,
  onPress,
  size = 60,
  ringOffset = 8,
  disabled = false,
  style,
  accessibilityLabel,
}: HaloPlayButtonProps) {
  const haloScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0.4);
  const pressScale = useSharedValue(1);

  // Pulse the outer halo ring while playing
  useEffect(() => {
    if (isPlaying && !disabled) {
      haloScale.value = withRepeat(
        withSequence(
          withTiming(1.18, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 1100, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      );
      haloOpacity.value = withRepeat(
        withSequence(
          withTiming(0.85, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.35, { duration: 1100, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(haloScale);
      cancelAnimation(haloOpacity);
      haloScale.value = withTiming(1, { duration: 250 });
      haloOpacity.value = withTiming(0.3, { duration: 250 });
    }
    return () => {
      cancelAnimation(haloScale);
      cancelAnimation(haloOpacity);
    };
  }, [isPlaying, disabled, haloScale, haloOpacity]);

  const haloAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity: haloOpacity.value,
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const triggerHaptic = useCallback(() => {
    Haptics?.impactAsync('medium');
  }, []);

  const handlePressIn = useCallback(() => {
    pressScale.value = withSpring(0.93, { damping: 14, stiffness: 240 });
    runOnJS(triggerHaptic)();
  }, [pressScale, triggerHaptic]);

  const handlePressOut = useCallback(() => {
    pressScale.value = withSpring(1, { damping: 14, stiffness: 240 });
  }, [pressScale]);

  const totalDiameter = size + (ringOffset * 2);
  const iconSize = Math.round(size * 0.44);

  return (
    <View style={[styles.container, { width: totalDiameter, height: totalDiameter }, style]}>
      {/* Outer Halo Pulsing Ring */}
      <Animated.View
        style={[
          styles.haloRing,
          {
            width: totalDiameter,
            height: totalDiameter,
            borderRadius: totalDiameter / 2,
            borderWidth: 2,
            borderColor: '#8EF20F',
          },
          haloAnimatedStyle,
        ]}
        pointerEvents="none"
      />

      {/* Main Core Button */}
      <Animated.View style={[buttonAnimatedStyle, styles.coreAnchor]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || (isPlaying ? 'Pause' : 'Play')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[
            styles.coreButton,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              opacity: disabled ? 0.45 : 1,
            },
          ]}
        >
          {/* Base Neon Lime Gradient */}
          <LinearGradient
            colors={['#C6FF5C', '#8EF20F', '#62DB0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Specular Top Crescent */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[
              StyleSheet.absoluteFill,
              {
                height: '46%',
                borderTopLeftRadius: size / 2,
                borderTopRightRadius: size / 2,
                borderBottomLeftRadius: size / 2,
                borderBottomRightRadius: size / 2,
              },
            ]}
            pointerEvents="none"
          />

          {/* Inner 1px Top Rim */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: size / 2,
                borderTopWidth: 1.2,
                borderTopColor: 'rgba(255, 255, 255, 0.65)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.25)',
              },
            ]}
            pointerEvents="none"
          />

          {/* 2dp Inner Bottom Tactile Lip */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: size / 2,
                borderBottomWidth: 2.5,
                borderBottomColor: '#55D80B',
              },
            ]}
            pointerEvents="none"
          />

          {/* Play / Pause Icon in Near-Black */}
          <View style={styles.iconWrap}>
            {isPlaying ? (
              <Pause size={iconSize} color="#0B1418" fill="#0B1418" />
            ) : (
              <Play size={iconSize} color="#0B1418" fill="#0B1418" style={{ marginLeft: 2 }} />
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  haloRing: {
    position: 'absolute',
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    shadowColor: '#8EF20F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
  coreAnchor: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  coreButton: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#8EF20F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  iconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
