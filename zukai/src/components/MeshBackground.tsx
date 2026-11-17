/**
 * ZUKAI MESH BACKGROUND (Phase UI-V2)
 * Renders high-performance pre-rendered Aurora WebP backgrounds (<150KB)
 * with graceful gradient-only fallback for low-end devices / battery-saver.
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';

const { width, height } = Dimensions.get('window');

const AURORA_IMAGES: Record<string, number> = {
  home: require('../../assets/aurora/home_aurora.webp'),
  library: require('../../assets/aurora/library_aurora.webp'),
  settings: require('../../assets/aurora/settings_aurora.webp'),
  player: require('../../assets/aurora/player_aurora.webp'),
  processing: require('../../assets/aurora/player_aurora.webp'),
  upload: require('../../assets/aurora/home_aurora.webp'),
  onboarding: require('../../assets/aurora/home_aurora.webp'),
  splash: require('../../assets/aurora/player_aurora.webp'),
  paywall: require('../../assets/aurora/settings_aurora.webp'),
};

const FALLBACK_GRADIENTS: Record<string, [string, string, string]> = {
  home: ['#0D3B2E', '#0F2A12', '#0B1418'],
  library: ['#0A3328', '#0D2615', '#0B1418'],
  settings: ['#0A2E2A', '#0D1E24', '#0B1418'],
  player: ['#133D22', '#0A2518', '#050D10'],
  processing: ['#0E3820', '#0A2A1A', '#071216'],
};

export type MeshVariant =
  | 'home'
  | 'library'
  | 'settings'
  | 'player'
  | 'processing'
  | 'upload'
  | 'onboarding'
  | 'splash'
  | 'paywall';

export interface MeshBackgroundProps {
  variant: MeshVariant | string;
  static?: boolean;
  useFallbackOnly?: boolean;
}

export function MeshBackground({ variant, useFallbackOnly = false }: MeshBackgroundProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const normalizedVariant = (variant in AURORA_IMAGES ? variant : 'home') as keyof typeof AURORA_IMAGES;
  const auroraSource = AURORA_IMAGES[normalizedVariant];
  const fallbackColors = FALLBACK_GRADIENTS[normalizedVariant] || FALLBACK_GRADIENTS.home;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0B1418' }]} pointerEvents="none">
      {/* 1. Base Dark Solid Canvas */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0B1418' }]} />

      {/* 2. Pre-rendered Aurora WebP Image (Ultra-cheap 60fps GPU layer) */}
      {!useFallbackOnly && !imageFailed && auroraSource && (
        <Image
          source={auroraSource}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={250}
          onError={() => setImageFailed(true)}
        />
      )}

      {/* 3. Gradient-Only Fallback (low-end devices or offline image error) */}
      {(useFallbackOnly || imageFailed) && (
        <LinearGradient
          colors={fallbackColors}
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* 4. Bottom Soft Vignette Fade into Canvas Base */}
      <LinearGradient
        colors={['transparent', 'rgba(11, 20, 24, 0.45)', '#0B1418']}
        locations={[0.45, 0.75, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
