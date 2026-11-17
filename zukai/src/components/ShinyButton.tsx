/**
 * ZUKAI SHINY BUTTON — 6-Layer Shine & Reflection Engine
 * Implements the full button anatomy from DESIGN_PRINCIPLES.md § 2.
 *
 * Layer Stack (bottom → top):
 *   1. Outer Glow Shadow (elevation / Skia)
 *   2. Base LinearGradient fill (#A4F924 → #92F702 → #75CE00)
 *   3. 1px Inner Light Rim stroke
 *   4. Top Gloss Half-Pill overlay (upper 45%)
 *   5. Moving Shimmer sweep bar (Reanimated, 1200ms, every 4000ms)
 *   6. Content (icon + label)
 *
 * All animation runs on the UI thread via Reanimated worklets.
 */

import React, { useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  cancelAnimation,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

// Haptics (optional — graceful degradation if not installed)
let Haptics: { impactAsync: (style: string) => Promise<void> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch {}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'dark-glossy'
  | 'glass'
  | 'destructive'
  | 'tertiary'
  | 'icon'
  | 'floating';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ShinyButtonProps {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  enableIdleShimmer?: boolean;
  onPress: () => void;
  style?: object;
  fullWidth?: boolean;
}

// ─── Size Tokens (Compact EdTech Specification) ─────────────────────────────

const SIZE_MAP: Record<ButtonSize, { height: number; paddingH: number; fontSize: number; iconSize: number }> = {
  sm: { height: 36, paddingH: 14, fontSize: 13, iconSize: 15 },
  md: { height: 44, paddingH: 18, fontSize: 14, iconSize: 16 },
  lg: { height: 52, paddingH: 22, fontSize: 15, iconSize: 18 },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ShinyButton({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  enableIdleShimmer,
  onPress,
  style,
  fullWidth = false,
}: ShinyButtonProps) {
  const { colors, gradients, motion, radius: r } = useTheme();
  const sizeToken = SIZE_MAP[size];
  const br = r.lg;

  // Should idle shimmer run? Default true for primary, false for others
  const runShimmer = enableIdleShimmer ?? variant === 'primary';

  // ── Animation Values ────────────────────────────────────────────────────
  const pressScale = useSharedValue(1);
  const shimmerX = useSharedValue(-150);

  // Press spring animation
  const animatedContainer = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  // Shimmer translateX animation
  const animatedShimmer = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  // Start idle shimmer loop with proper bounds and cleanup
  useEffect(() => {
    if (!runShimmer || disabled) {
      shimmerX.value = -150;
      cancelAnimation(shimmerX);
      return;
    }

    shimmerX.value = -150;
    shimmerX.value = withRepeat(
      withSequence(
        withTiming(550, { duration: 1300 }),
        withDelay(3200, withTiming(-150, { duration: 50 }))
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(shimmerX);
    };
  }, [runShimmer, disabled, shimmerX]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const triggerHaptic = useCallback(() => {
    Haptics?.impactAsync('medium');
  }, []);

  const handlePressIn = useCallback(() => {
    pressScale.value = withSpring(motion.scale.pressed, motion.spring.snappy);
    runOnJS(triggerHaptic)();
  }, [pressScale, motion, triggerHaptic]);

  const handlePressOut = useCallback(() => {
    pressScale.value = withSpring(1, motion.spring.snappy);
  }, [pressScale, motion]);

  // ── Style resolution by variant ──────────────────────────────────────────
  const isPrimary = variant === 'primary';
  const isDarkGlossy = variant === 'dark-glossy';
  const isGlass = variant === 'glass' || variant === 'secondary' || variant === 'tertiary';
  const isDestructive = variant === 'destructive';
  const isIcon = variant === 'icon';

  const outerGlowColor = isDestructive
    ? 'rgba(255,61,113,0.35)'
    : isPrimary
    ? 'rgba(142,242,15,0.35)'
    : isDarkGlossy
    ? 'rgba(0,0,0,0.45)'
    : 'rgba(255,255,255,0.08)';

  // ── Gradient selection ───────────────────────────────────────────────────
  let baseGradientColors: readonly string[];
  let baseGradientStart = { x: 0, y: 0 };
  let baseGradientEnd = { x: 1, y: 1 };

  if (isDestructive) {
    baseGradientColors = gradients.button.destructive.colors;
  } else if (isDarkGlossy) {
    // Dark glossy: #1A242B to #0B1418
    baseGradientColors = ['#1A242B', '#0B1418'];
    baseGradientStart = { x: 0, y: 0 };
    baseGradientEnd = { x: 0, y: 1 };
  } else if (isGlass) {
    // Glass: rgba white 8% to 4%
    baseGradientColors = ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)'];
    baseGradientStart = { x: 0, y: 0 };
    baseGradientEnd = { x: 0, y: 1 };
  } else {
    // Lime: #C6FF5C to #8EF20F to #62DB0B
    baseGradientColors = ['#C6FF5C', '#8EF20F', '#62DB0B'];
  }

  const textColor = isPrimary
    ? '#0B1418' // Dark text on Lime button for AA contrast
    : isDestructive
    ? '#FFFFFF'
    : '#F4F7F2';

  const iconColor = textColor;
  const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

  return (
    <Animated.View
      style={[
        animatedContainer,
        fullWidth && styles.fullWidth,
        // Outer glow shadow
        (isPrimary || isDestructive || isDarkGlossy) && {
          shadowColor: outerGlowColor,
          shadowOffset: { width: 0, height: isPrimary ? 8 : 4 },
          shadowOpacity: isPrimary ? 0.35 : 0.5,
          shadowRadius: isPrimary ? 20 : 12,
          elevation: isPrimary ? 8 : 4,
        },
        style,
      ]}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled || loading}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        style={[
          styles.pressable,
          {
            height: sizeToken.height,
            width: isIcon ? sizeToken.height : fullWidth ? '100%' : undefined,
            borderRadius: isIcon ? sizeToken.height / 2 : br,
            overflow: 'hidden',
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        {/* Layer 1: Base Gradient */}
        <LinearGradient
          colors={baseGradientColors as unknown as [string, string, ...string[]]}
          start={baseGradientStart}
          end={baseGradientEnd}
          style={StyleSheet.absoluteFill}
        />

        {/* Layer 2a: Specular Highlight Curved Crescent (top 45%, 55% to 0% opacity with elliptical bottom) */}
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            StyleSheet.absoluteFill,
            {
              height: '45%',
              borderTopLeftRadius: isIcon ? sizeToken.height / 2 : br,
              borderTopRightRadius: isIcon ? sizeToken.height / 2 : br,
              borderBottomLeftRadius: br * 1.5,
              borderBottomRightRadius: br * 1.5,
              opacity: isDarkGlossy ? 0.25 : 1,
            },
          ]}
          pointerEvents="none"
        />

        {/* Layer 2b: Inner 1px top stroke (white 60% fading to 0) */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: isIcon ? sizeToken.height / 2 : br,
              borderTopWidth: 1,
              borderTopColor: isPrimary
                ? 'rgba(255,255,255,0.60)'
                : isDarkGlossy
                ? 'rgba(255,255,255,0.20)'
                : 'rgba(255,255,255,0.15)',
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderLeftColor: isPrimary ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)',
              borderRightColor: isPrimary ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)',
            },
          ]}
          pointerEvents="none"
        />

        {/* Layer 2c: 2dp inner bottom lip for tactile 3D feel */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderBottomWidth: 2,
              borderBottomColor: isPrimary
                ? '#55D80B' // Darker green lip
                : isDarkGlossy
                ? '#050B0D' // Darker black lip
                : 'rgba(0,0,0,0.3)',
              borderRadius: isIcon ? sizeToken.height / 2 : br,
            },
          ]}
        />

        {/* Layer 3: Moving Shimmer sweep bar (idle shimmer every ~5s on primary CTA) */}
        {runShimmer && !disabled && (
          <Animated.View
            style={[
              styles.shimmerBar,
              animatedShimmer,
              { height: sizeToken.height },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Layer 4: Content */}
        <View
          style={[
            styles.content,
            { paddingHorizontal: isIcon ? 0 : sizeToken.paddingH },
          ]}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color={isPrimary ? '#0B1418' : '#8EF20F'}
            />
          ) : (
            <>
              {icon && iconPosition === 'left' && (
                <View style={styles.iconLeft}>{icon}</View>
              )}
              {label && (
                <Text
                  variant="callout"
                  rawColor={textColor}
                  style={{
                    fontWeight: isPrimary ? '800' : '700',
                    fontSize: sizeToken.fontSize,
                    letterSpacing: isPrimary ? 0.5 : 0,
                  }}
                >
                  {isPrimary ? label.toUpperCase() : label}
                </Text>
              )}
              {icon && iconPosition === 'right' && (
                <View style={styles.iconRight}>{icon}</View>
              )}
              {icon && !label && icon}
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressable: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconLeft: {
    marginRight: 4,
  },
  iconRight: {
    marginLeft: 4,
  },
  shimmerBar: {
    position: 'absolute',
    width: 32,
    backgroundColor: 'rgba(255,255,255,0.45)',
    transform: [{ skewX: '-25deg' }],
    top: 0,
    left: 0,
  },
});

