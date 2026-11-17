/**
 * ZUKAI WAVEFORM COMPONENT
 * Supports:
 * 1. Real audio peaks visualization from waveform_peaks array (200-300 samples)
 * 2. Scrubbing / touch seeking via onSeek callback
 * 3. Fallback animated wave visualizer when peaks are not available
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider';

export interface WaveformProps {
  barCount?: number;
  height?: number;
  color?: string;
  inactiveColor?: string;
  active?: boolean;
  amplitude?: number; // 0–1
  peaks?: number[] | null;
  progress?: number; // 0–1
  onSeek?: (fraction: number) => void;
}

function WaveBar({
  delay,
  height,
  color,
  active,
}: {
  delay: number;
  height: number;
  color: string;
  active: boolean;
}) {
  const scaleY = useSharedValue(0.3);

  useEffect(() => {
    if (active) {
      scaleY.value = withDelay(
        delay,
        withRepeat(
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        )
      );
    } else {
      scaleY.value = withTiming(0.3, { duration: 300 });
    }
  }, [active, delay, scaleY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 3,
          height,
          borderRadius: 2,
          backgroundColor: color,
          marginHorizontal: 1.5,
        },
        animStyle,
      ]}
    />
  );
}

export function Waveform({
  barCount = 40,
  height = 48,
  color,
  inactiveColor = 'rgba(255, 255, 255, 0.18)',
  active = false,
  amplitude = 0.6,
  peaks,
  progress = 0,
  onSeek,
}: WaveformProps) {
  const { colors } = useTheme();
  const barColor = color ?? colors.brand.hero;

  // Handle touch / drag scrub if onSeek is provided
  const handleTouch = (evt: GestureResponderEvent) => {
    if (!onSeek) return;
    const { locationX } = evt.nativeEvent;
    // Calculate fraction based on container width
    const target = evt.currentTarget as any;
    target?.measure?.((_x: number, _y: number, width: number) => {
      if (width > 0) {
        const frac = Math.max(0, Math.min(1, locationX / width));
        onSeek(frac);
      }
    });
  };

  // If real peaks data is provided, render peaks scrubber
  if (peaks && Array.isArray(peaks) && peaks.length > 0) {
    // Resample peaks to barCount
    const step = peaks.length / barCount;
    const sampledPeaks: number[] = [];

    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor(i * step);
      sampledPeaks.push(peaks[idx] ?? 60);
    }

    const activeBarIndex = Math.floor(progress * barCount);

    return (
      <View
        style={[styles.container, { height }]}
        onStartShouldSetResponder={() => Boolean(onSeek)}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
      >
        {sampledPeaks.map((peakVal, i) => {
          // Normalize peak (0..255) to height (min 4px, max height)
          const barHeight = Math.max(4, Math.round((peakVal / 255) * height));
          const isPassed = i <= activeBarIndex;

          return (
            <View
              key={i}
              style={{
                width: 3,
                height: barHeight,
                borderRadius: 2,
                backgroundColor: isPassed ? barColor : inactiveColor,
                marginHorizontal: 1.5,
              }}
            />
          );
        })}
      </View>
    );
  }

  // Fallback: animated wave bars
  return (
    <View style={[styles.container, { height }]}>
      {Array.from({ length: barCount }).map((_, i) => (
        <WaveBar
          key={i}
          delay={i * 40}
          height={height}
          color={barColor}
          active={active}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});
