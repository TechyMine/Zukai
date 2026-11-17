/**
 * ZUKAI OFFLINE BANNER
 * Location: /zukai/src/components/OfflineBanner.tsx
 * Displays a non-intrusive banner when device network is unavailable.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { Text } from './Text';
import { useNetworkState } from '@/hooks/useNetworkState';

export function OfflineBanner() {
  const { isOnline } = useNetworkState();
  const insets = useSafeAreaInsets();

  if (isOnline) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 4 }]}>
      <WifiOff size={14} color="#09161B" strokeWidth={2.5} />
      <Text variant="caption" rawColor="#09161B" style={styles.text}>
        Offline mode — playing from local storage
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFD600',
    paddingBottom: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 9999,
  },
  text: {
    fontWeight: '700',
    fontSize: 12,
  },
});
