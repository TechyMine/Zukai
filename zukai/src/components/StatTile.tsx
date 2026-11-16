import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { GlassCard } from './GlassCard';
import { Text } from './Text';

export interface StatTileProps {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  number: string | number;
  label: string;
  iconTint?: string;
  onPress?: () => void;
}

export function StatTile({
  icon: Icon,
  number,
  label,
  iconTint = '#8EF20F',
  onPress,
}: StatTileProps) {
  const content = (
    <GlassCard style={styles.card} padding={10} borderRadius={16}>
      <View style={styles.row}>
        {/* Tinted icon square */}
        <View style={[styles.iconBox, { backgroundColor: `${iconTint}18`, borderColor: `${iconTint}30` }]}>
          <Icon size={16} color={iconTint} strokeWidth={2.5} />
        </View>

        {/* Big number & label */}
        <View style={styles.textWrap}>
          <Text variant="headline" rawColor="#F4F7F2" numberOfLines={1} style={styles.number}>
            {String(number)}
          </Text>
          <Text variant="caption" rawColor="#A2B4BE" numberOfLines={1} style={styles.label}>
            {label}
          </Text>
        </View>
      </View>
    </GlassCard>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.pressable}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.pressable}>{content}</View>;
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    minWidth: 140,
  },
  card: {
    height: 76,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 1,
  },
  number: {
    fontWeight: '800',
    fontSize: 18,
    lineHeight: 22,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
