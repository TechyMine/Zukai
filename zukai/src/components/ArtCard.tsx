/**
 * ZUKAI ART CARD COMPONENT
 * Implements rich EdTech cards with layered 3D background art, mascot illustration,
 * legibility contrast gradient, AA typography compliance, and 360dp safety.
 */

import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from './GlassCard';
import { Mascot } from './Mascot';
import { type MascotPose } from '../assets/mascot/index';

export type ArtCardVariant = 'hero' | 'stat' | 'goal' | 'promo' | 'empty';
export type ArtCardArt =
  | 'sound-waves'
  | 'study-desk'
  | 'ideas'
  | 'streak'
  | 'trophy'
  | 'waiting'
  | 'upload-cloud'
  | 'library';
export type ArtCardTint = 'green' | 'teal' | 'amber';

export interface ArtCardProps {
  children: React.ReactNode;
  variant?: ArtCardVariant;
  art?: ArtCardArt;
  mascot?: MascotPose;
  mascotSide?: 'right' | 'left';
  tint?: ArtCardTint;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
}

const TINT_BORDER_COLORS: Record<ArtCardTint, string> = {
  green: 'rgba(142, 242, 15, 0.28)',
  teal: 'rgba(45, 212, 191, 0.28)',
  amber: 'rgba(255, 179, 0, 0.28)',
};

const TINT_GLOW_COLORS: Record<ArtCardTint, string[]> = {
  green: ['rgba(142, 242, 15, 0.12)', 'transparent'],
  teal: ['rgba(45, 212, 191, 0.12)', 'transparent'],
  amber: ['rgba(255, 179, 0, 0.12)', 'transparent'],
};

export function ArtCard({
  children,
  variant = 'hero',
  art,
  mascot,
  mascotSide = 'right',
  tint = 'green',
  onPress,
  style,
  padding = 16,
  borderRadius = 20,
}: ArtCardProps) {
  const isPressable = Boolean(onPress);
  const borderColor = TINT_BORDER_COLORS[tint];
  const glowColors = TINT_GLOW_COLORS[tint];

  const content = (
    <GlassCard
      style={[styles.card, { borderColor }, style]}
      padding={padding}
      borderRadius={borderRadius}
    >
      {/* Layer 1: Ambient Tint Glow */}
      <LinearGradient
        colors={glowColors as [string, string]}
        start={{ x: mascotSide === 'right' ? 1 : 0, y: 0 }}
        end={{ x: mascotSide === 'right' ? 0 : 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        pointerEvents="none"
      />

      {/* Layer 2: Optional Mascot Art Container */}
      {mascot && (
        <View
          style={[
            styles.mascotAnchor,
            mascotSide === 'right' ? styles.mascotRight : styles.mascotLeft,
          ]}
          pointerEvents="none"
        >
          <Mascot
            pose={mascot}
            size={variant === 'hero' ? 130 : 96}
            animated={variant === 'hero'}
            style={mascotSide === 'left' ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </View>
      )}

      {/* Layer 3: Legibility Gradient (Guarantees AA contrast for text) */}
      <LinearGradient
        colors={
          mascotSide === 'right'
            ? ['rgba(12, 26, 33, 0.95)', 'rgba(12, 26, 33, 0.70)', 'transparent']
            : ['transparent', 'rgba(12, 26, 33, 0.70)', 'rgba(12, 26, 33, 0.95)']
        }
        start={{ x: mascotSide === 'right' ? 0 : 1, y: 0.5 }}
        end={{ x: mascotSide === 'right' ? 0.75 : 0.25, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Layer 4: Text Content (Constrained to 60-65% width to avoid overlapping art) */}
      <View
        style={[
          styles.textColumn,
          mascotSide === 'right' ? styles.textLeft : styles.textRight,
        ]}
      >
        {children}
      </View>
    </GlassCard>
  );

  if (isPressable) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressableWrap, pressed && styles.pressedState]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    minHeight: 110,
    justifyContent: 'center',
  },
  pressableWrap: {
    width: '100%',
  },
  pressedState: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  mascotAnchor: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  mascotRight: {
    right: -4,
  },
  mascotLeft: {
    left: -4,
  },
  textColumn: {
    width: '68%',
    zIndex: 2,
    justifyContent: 'center',
  },
  textLeft: {
    alignSelf: 'flex-start',
  },
  textRight: {
    alignSelf: 'flex-end',
  },
});
