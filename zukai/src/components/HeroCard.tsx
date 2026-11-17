/**
 * ZUKAI HERO CARD (Phase UI-V2)
 * High-density illustrated hero cards with 3D Zuke anchored in the bottom-right corner.
 * Implements lime, forest, glass, and aurora variants, silk-wave texture overlay,
 * glossy top reflection, 58% text width containment, and AA contrast compliance.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { mascotImages, type MascotPose } from '../assets/mascot/index';

const SILK_WAVE_TEXTURE = require('../../assets/textures/silk_wave.webp');

export type HeroCardVariant = 'lime' | 'forest' | 'glass' | 'aurora';
export type HeroCardSize = 'wide' | 'tall' | 'compact';

export interface HeroCardProps {
  children: React.ReactNode;
  variant?: HeroCardVariant;
  size?: HeroCardSize;
  mascot?: MascotPose;
  mascotMirror?: boolean;
  animated?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function HeroCard({
  children,
  variant = 'lime',
  size = 'wide',
  mascot,
  mascotMirror = false,
  animated = false,
  onPress,
  style,
  padding = 20,
  borderRadius = 24,
  accessibilityLabel,
  accessibilityHint,
}: HeroCardProps) {
  const isPressable = Boolean(onPress);
  const isLime = variant === 'lime';
  const isForest = variant === 'forest';
  const isAurora = variant === 'aurora';
  const isTall = size === 'tall';
  const isCompact = size === 'compact';

  // Float animation for hero card mascot
  const floatY = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reducedMotionRef.current = enabled;
      if (animated && !enabled) {
        floatY.value = withRepeat(
          withSequence(
            withTiming(-5, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
            withTiming(5, { duration: 2000, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          true
        );
      }
    });

    return () => {
      cancelAnimation(floatY);
    };
  }, [animated, floatY]);

  const mascotAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatY.value },
      { scaleX: mascotMirror ? -1 : 1 },
    ],
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handlePressIn = () => {
    if (isPressable) {
      pressScale.value = withSpring(0.98, { damping: 14, stiffness: 240 });
    }
  };

  const handlePressOut = () => {
    if (isPressable) {
      pressScale.value = withSpring(1, { damping: 14, stiffness: 240 });
    }
  };

  // Gradients per variant
  let gradientColors: [string, string, ...string[]];
  let gradientLocations: [number, number, ...number[]] | undefined;
  let gradientStart = { x: 0, y: 0 };
  let gradientEnd = { x: 1, y: 1 };

  if (isLime) {
    // 160 deg lime: #E4FFA3 -> #B6F94A -> #8EF20F -> #55D80B
    gradientColors = ['#E4FFA3', '#B6F94A', '#8EF20F', '#55D80B'];
    gradientLocations = [0, 0.35, 0.70, 1];
    gradientStart = { x: 0.15, y: 0 };
    gradientEnd = { x: 0.85, y: 1 };
  } else if (isForest) {
    // deep green #0F2A12 to #0B1418 with lime glow
    gradientColors = ['#0F2A12', '#0C1B14', '#0B1418'];
    gradientLocations = [0, 0.6, 1];
  } else if (isAurora) {
    // deep cyber teal to #0B1418
    gradientColors = ['#0D3B2E', '#0B231D', '#0B1418'];
    gradientLocations = [0, 0.55, 1];
  } else {
    // dark glass: #12191E to #0E1418
    gradientColors = ['#12191E', '#0E1418'];
    gradientLocations = [0, 1];
  }

  // Mascot dimensions
  const mascotDimensions = isTall
    ? { width: 180, height: 180, bottom: -12, right: -10 }
    : isCompact
    ? { width: 110, height: 110, bottom: -8, right: -6 }
    : { width: 155, height: 155, bottom: -12, right: -10 };

  const content = (
    <View
      style={[
        styles.cardContainer,
        {
          borderRadius,
          padding,
          minHeight: isTall ? 240 : isCompact ? 100 : 160,
          borderColor: isLime
            ? 'rgba(255, 255, 255, 0.50)'
            : 'rgba(255, 255, 255, 0.08)',
        },
        isLime && styles.limeGlowShadow,
        style,
      ]}
    >
      {/* 1. Base Gradient Fill */}
      <LinearGradient
        colors={gradientColors}
        locations={gradientLocations}
        start={gradientStart}
        end={gradientEnd}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />

      {/* 2. Silk-Wave Texture Overlay (15% opacity on Lime cards, 10% on dark cards) */}
      <View
        style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]}
        pointerEvents="none"
      >
        <Image
          source={SILK_WAVE_TEXTURE}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: isLime ? 0.16 : 0.09,
              tintColor: isLime ? '#000000' : '#FFFFFF',
            },
          ]}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </View>

      {/* 3. Top Gloss Reflection Crescent */}
      <LinearGradient
        colors={
          isLime
            ? ['rgba(255, 255, 255, 0.40)', 'rgba(255, 255, 255, 0.00)']
            : ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.00)']
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[
          styles.topGloss,
          {
            borderTopLeftRadius: borderRadius,
            borderTopRightRadius: borderRadius,
          },
        ]}
        pointerEvents="none"
      />

      {/* 4. Inner 1px top stroke */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderTopWidth: 1.2,
            borderTopColor: isLime
              ? 'rgba(255, 255, 255, 0.70)'
              : 'rgba(255, 255, 255, 0.18)',
          },
        ]}
        pointerEvents="none"
      />

      {/* 5. Mascot at Bottom-Right Corner (Decorative: accessible=false) */}
      {mascot && mascotImages[mascot] && (
        <View
          style={[
            styles.mascotAnchor,
            {
              width: mascotDimensions.width,
              height: mascotDimensions.height,
              bottom: mascotDimensions.bottom,
              right: mascotDimensions.right,
            },
          ]}
          pointerEvents="none"
          accessible={false}
          aria-hidden={true}
        >
          {/* Faint Lime Ambient Glow behind Zuke */}
          <View
            style={[
              styles.mascotGlowCircle,
              {
                width: mascotDimensions.width * 0.85,
                height: mascotDimensions.height * 0.85,
                borderRadius: mascotDimensions.width * 0.425,
                backgroundColor: isLime
                  ? 'rgba(255, 255, 255, 0.25)'
                  : 'rgba(142, 242, 15, 0.18)',
              },
            ]}
          />

          <Animated.View style={[StyleSheet.absoluteFill, mascotAnimatedStyle]}>
            <Image
              source={mascotImages[mascot]}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </Animated.View>
        </View>
      )}

      {/* 6. Content Column (Constrained to 58% width to never overlap Zuke) */}
      <View
        style={[
          styles.contentColumn,
          {
            width: isTall ? '100%' : '58%',
            paddingBottom: isTall ? 80 : 0,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );

  if (isPressable) {
    return (
      <Animated.View style={cardAnimatedStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          style={styles.pressable}
        >
          {content}
        </Pressable>
      </Animated.View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  cardContainer: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
  },
  limeGlowShadow: {
    shadowColor: '#8EF20F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8,
  },
  topGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
  mascotAnchor: {
    position: 'absolute',
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mascotGlowCircle: {
    position: 'absolute',
    alignSelf: 'center',
  },
  contentColumn: {
    zIndex: 3,
    justifyContent: 'center',
  },
});
