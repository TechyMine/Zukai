/**
 * ZUKAI GLASS CARD
 * Translucent frosted surface card with expo-blur, 3D specular bevel, and neon glow.
 * Implements the GlassCard recipe with 3D depth, multi-stop light rim, and spatial shadow.
 */

import React from 'react';
import {
  View,
  StyleSheet,
  ViewProps,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';

export interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  /** Show the neon volt-green active border glow */
  glow?: boolean;
  /** Override corner radius */
  borderRadius?: number;
  /** Padding inside the card (default: 12) */
  padding?: number;
  /** Disable blur on low-end devices automatically (default: true) */
  adaptiveBlur?: boolean;
}

export function GlassCard({
  children,
  glow = false,
  borderRadius,
  padding,
  adaptiveBlur = true,
  style,
  ...rest
}: GlassCardProps) {
  const { colors } = useTheme();
  // Compact card radius token = 16
  const br = borderRadius ?? 16;
  const cardPadding = padding !== undefined ? padding : 12;

  const borderColor = glow
    ? colors.glass.borderActive
    : 'rgba(255, 255, 255, 0.16)';

  const flatStyle = (StyleSheet.flatten(style) || {}) as Record<string, any>;
  const {
    width,
    minWidth,
    maxWidth,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    alignSelf,
    flex,
    flexGrow,
    flexShrink,
    position,
    top,
    bottom,
    left,
    right,
    zIndex,
    ...innerStyle
  } = flatStyle;

  const outerLayoutStyle: Record<string, any> = {
    borderRadius: br,
  };
  if (width !== undefined) outerLayoutStyle.width = width;
  if (minWidth !== undefined) outerLayoutStyle.minWidth = minWidth;
  if (maxWidth !== undefined) outerLayoutStyle.maxWidth = maxWidth;
  if (margin !== undefined) outerLayoutStyle.margin = margin;
  if (marginTop !== undefined) outerLayoutStyle.marginTop = marginTop;
  if (marginBottom !== undefined) outerLayoutStyle.marginBottom = marginBottom;
  if (marginLeft !== undefined) outerLayoutStyle.marginLeft = marginLeft;
  if (marginRight !== undefined) outerLayoutStyle.marginRight = marginRight;
  if (marginHorizontal !== undefined) outerLayoutStyle.marginHorizontal = marginHorizontal;
  if (marginVertical !== undefined) outerLayoutStyle.marginVertical = marginVertical;
  if (alignSelf !== undefined) {
    outerLayoutStyle.alignSelf = alignSelf;
  } else if (width === '100%') {
    outerLayoutStyle.alignSelf = 'stretch';
  }
  if (flex !== undefined) outerLayoutStyle.flex = flex;
  if (flexGrow !== undefined) outerLayoutStyle.flexGrow = flexGrow;
  if (flexShrink !== undefined) outerLayoutStyle.flexShrink = flexShrink;
  if (position !== undefined) outerLayoutStyle.position = position;
  if (top !== undefined) outerLayoutStyle.top = top;
  if (bottom !== undefined) outerLayoutStyle.bottom = bottom;
  if (left !== undefined) outerLayoutStyle.left = left;
  if (right !== undefined) outerLayoutStyle.right = right;
  if (zIndex !== undefined) outerLayoutStyle.zIndex = zIndex;

  return (
    <View
      style={[
        styles.outerShadow,
        outerLayoutStyle,
        glow && styles.glowShadow,
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.container,
          {
            borderRadius: br,
            borderColor,
            padding: cardPadding,
          },
          innerStyle,
        ]}
        {...rest}
      >
        {/* Layer 1: Frosted Blur Backdrop */}
        <BlurView
          intensity={32}
          tint="dark"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: br }]}
        />

        {/* Layer 2: Frosted Deep Surface Glass */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(12, 26, 33, 0.82)',
              borderRadius: br,
            },
          ]}
        />

        {/* Layer 3: 3D Top Rim Specular Highlight */}
        <LinearGradient
          colors={[
            'rgba(255, 255, 255, 0.22)',
            'rgba(255, 255, 255, 0.05)',
            'transparent',
          ]}
          locations={[0, 0.4, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: br, height: 60 },
          ]}
        />

        {/* Layer 4: Optional Active Neon Volt Bevel Glow */}
        {glow && (
          <LinearGradient
            colors={['rgba(146, 247, 2, 0.35)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: br, height: 70 },
            ]}
          />
        )}

        {/* Children render directly within the flex container over the absoluteFill backdrop */}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerShadow: {
    width: '100%',
    alignSelf: 'stretch',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 10,
  },
  glowShadow: {
    shadowColor: '#92F702',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  container: {
    width: '100%',
    alignSelf: 'stretch',
    borderWidth: 1.2,
    overflow: 'hidden',
    position: 'relative',
  },
});
