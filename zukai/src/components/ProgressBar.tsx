import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './Text';

export interface ProgressBarProps {
  progress: number; // 0 to 100
  label?: string; // Optional label displayed inside the bar when wide enough
  height?: number; // Default: 16 (chunky)
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  label,
  height = 16,
  style,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const showText = height >= 14 && clamped >= 25;

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }, style]}>
      {/* 3D Dark Inset Shadow Overlay */}
      <View style={[StyleSheet.absoluteFill, styles.insetShadow, { borderRadius: height / 2 }]} pointerEvents="none" />

      {/* Glossy Green Gradient Fill */}
      {clamped > 0 && (
        <View style={[styles.fillWrapper, { width: `${clamped}%`, borderRadius: height / 2 }]}>
          <LinearGradient
            colors={['#C6FF5C', '#8EF20F', '#62DB0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Top Specular Highlight Half-Pill */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.highlight, { height: Math.floor(height * 0.45), borderTopLeftRadius: height / 2, borderTopRightRadius: height / 2 }]}
            pointerEvents="none"
          />

          {/* Bottom Tactile Edge */}
          <View style={[styles.bottomEdge, { borderBottomColor: '#55D80B' }]} pointerEvents="none" />

          {/* Value text inside when wide enough */}
          {showText && (
            <View style={styles.textContainer}>
              <Text variant="caption" rawColor="#09161B" style={styles.valueText}>
                {label ?? `${clamped}%`}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: 'rgba(9, 22, 27, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  insetShadow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.6)',
  },
  fillWrapper: {
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  bottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(74, 140, 0, 0.65)',
  },
  textContainer: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#09161B',
  },
});
