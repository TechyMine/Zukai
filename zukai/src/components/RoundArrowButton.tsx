/**
 * ZUKAI ROUND ARROW BUTTON (Phase UI-V2)
 * 36dp circular glossy button with a diagonal arrow (like the reference design).
 * Used across Bento cards, section action tiles, and quick access rows.
 */

import React, { useCallback } from 'react';
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
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, ArrowRight } from 'lucide-react-native';

let Haptics: { impactAsync: (style: string) => Promise<void> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch {}

export type RoundArrowVariant = 'dark-glossy' | 'lime' | 'glass';

export interface RoundArrowButtonProps {
  onPress: () => void;
  variant?: RoundArrowVariant;
  size?: number; // default 36dp
  direction?: 'diagonal' | 'right';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function RoundArrowButton({
  onPress,
  variant = 'dark-glossy',
  size = 36,
  direction = 'diagonal',
  disabled = false,
  style,
  accessibilityLabel = 'Open',
}: RoundArrowButtonProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const triggerHaptic = useCallback(() => {
    Haptics?.impactAsync('light');
  }, []);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.92, { damping: 14, stiffness: 240 });
    runOnJS(triggerHaptic)();
  }, [scale, triggerHaptic]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 240 });
  }, [scale]);

  const isLime = variant === 'lime';
  const isGlass = variant === 'glass';

  const gradientColors: [string, string] = isLime
    ? ['#C6FF5C', '#8EF20F']
    : isGlass
    ? ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.04)']
    : ['#222E36', '#0E161B'];

  const iconColor = isLime ? '#0B1418' : '#F4F7F2';
  const iconSize = Math.round(size * 0.48);

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        {/* Base Gradient */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Specular Top Crescent */}
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.00)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            StyleSheet.absoluteFill,
            {
              height: '48%',
              borderTopLeftRadius: size / 2,
              borderTopRightRadius: size / 2,
              borderBottomLeftRadius: size / 2,
              borderBottomRightRadius: size / 2,
            },
          ]}
          pointerEvents="none"
        />

        {/* 1px Inner Top Stroke */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              borderWidth: 1,
              borderColor: isLime ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.14)',
            },
          ]}
          pointerEvents="none"
        />

        {/* Arrow Icon */}
        <View style={styles.iconContainer}>
          {direction === 'diagonal' ? (
            <ArrowUpRight size={iconSize} color={iconColor} strokeWidth={2.4} />
          ) : (
            <ArrowRight size={iconSize} color={iconColor} strokeWidth={2.4} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
