/**
 * ZUKAI BOTTOM TABS LAYOUT (Phase 7B Compact Polish)
 * Glass-pill floating tab bar with solid #0B1418 backdrop tint fallback,
 * slim profile, non-clipping labels, and conditional hiding during Configure Audio.
 */

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Home, BookOpen, Upload, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { GlobalUploadIndicator } from '@/components/GlobalUploadIndicator';
import { GlobalMiniPlayer } from '@/components/GlobalMiniPlayer';
import { useUploadStore } from '@/features/upload/uploadManager';

// ─── Tab Item ───────────────────────────────────────────────────────────────

function TabItem({
  label,
  icon: Icon,
  active,
  onPress,
  isCenter = false,
}: {
  label: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  active: boolean;
  onPress: () => void;
  isCenter?: boolean;
}) {
  const { colors, motion } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(motion.scale.pressed, motion.spring.snappy);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, motion.spring.snappy);
  };

  if (isCenter) {
    return (
      <Animated.View style={animStyle}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={onPress}
          style={styles.centerButton}
          accessibilityRole="button"
          accessibilityLabel="Upload document"
        >
          {/* Outer Halo Ring */}
          <View style={styles.centerHaloRing}>
            <LinearGradient
              colors={['#C6FF5C', '#8EF20F', '#62DB0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.centerGradient}
            >
              {/* Top Gloss Crescent */}
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.centerTopGloss}
                pointerEvents="none"
              />
              <Icon size={22} color="#0B1418" strokeWidth={2.6} />
            </LinearGradient>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.tabItem, animStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={styles.tabPressable}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
      >
        {active && (
          <View style={styles.activeIndicatorWrap}>
            <View style={[styles.activeIndicator, { backgroundColor: '#8EF20F' }]} />
          </View>
        )}
        <Icon
          size={20}
          color={active ? '#8EF20F' : '#6B828F'}
          strokeWidth={active ? 2.5 : 2}
        />
        <Text
          variant="caption"
          rawColor={active ? '#8EF20F' : '#A2B4BE'}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.tabLabel}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Custom Tab Bar ──────────────────────────────────────────────────────────

function ZukaiTabBar({
  state,
}: {
  state: { index: number; routes: Array<{ name: string }> };
  navigation: { navigate: (name: string) => void };
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Hide tab bar when in configure audio flow
  const isConfiguringAudio = useUploadStore(
    (s) => Boolean(s.file || s.activeDocument || s.status !== 'idle')
  );
  const activeRoute = state.routes[state.index]?.name;
  if (activeRoute === 'upload' && isConfiguringAudio) {
    return null;
  }

  const TAB_CONFIG = [
    { name: 'home', label: 'Home', icon: Home },
    { name: 'library', label: 'Library', icon: BookOpen },
    { name: 'upload', label: 'Upload', icon: Upload, center: true },
    { name: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <View style={[styles.barWrapper, { paddingBottom: Math.max(8, insets.bottom) }]}>
      {/* Floating Glass Pill */}
      <View style={styles.barPill}>
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        {/* Solid #0B1418 cyber dark backdrop fallback to prevent underlying text bleeds */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(11, 20, 24, 0.94)',
              borderRadius: 32,
              borderWidth: 1.2,
              borderColor: 'rgba(255, 255, 255, 0.12)',
            },
          ]}
        />
        <View style={styles.barContent}>
          {TAB_CONFIG.map((tab) => {
            const isActive = state.routes[state.index]?.name === tab.name;
            return (
              <TabItem
                key={tab.name}
                label={tab.label}
                icon={tab.icon}
                active={isActive}
                onPress={() => router.push(`/(tabs)/${tab.name}` as any)}
                isCenter={tab.center}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Tabs Layout ─────────────────────────────────────────────────────────────

export default function TabsLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1 }}>
        <Tabs
          tabBar={(props: any) => <ZukaiTabBar state={props.state} navigation={props.navigation} />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="home" />
          <Tabs.Screen name="library" />
          <Tabs.Screen name="upload" />
          <Tabs.Screen name="settings" />
        </Tabs>
        <GlobalMiniPlayer />
        <GlobalUploadIndicator />
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  barWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  barPill: {
    width: '100%',
    borderRadius: 32,
    overflow: 'hidden',
  },
  barContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPressable: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  activeIndicatorWrap: {
    position: 'absolute',
    top: -2,
    alignItems: 'center',
    shadowColor: '#8EF20F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  activeIndicator: {
    width: 20,
    height: 3,
    borderRadius: 1.5,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  centerButton: {
    marginHorizontal: 4,
  },
  centerHaloRing: {
    padding: 3,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(142, 242, 15, 0.45)',
    backgroundColor: 'rgba(142, 242, 15, 0.08)',
  },
  centerGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#8EF20F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#55D80B',
  },
  centerTopGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});
