/**
 * ZUKAI QUOTA WARNING BOTTOM SHEET
 * Replaces the unstyled native white Alert with a themed, friendly edtech bottom sheet.
 * Features Zuke with an hourglass, exact humanized minute calculations, and actionable options.
 */

import React from 'react';
import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { Hourglass, ArrowDown, X, Sparkles } from 'lucide-react-native';
import { GlassCard } from './GlassCard';
import { Text } from './Text';
import { ShinyButton } from './ShinyButton';
import { Mascot } from './Mascot';
import { formatMinutes } from '../lib/formatMinutes';
import { DepthMode } from '../types/database';

interface QuotaWarningSheetProps {
  visible: boolean;
  minutesRemaining: number;
  neededMinutes: number;
  currentDepth: DepthMode;
  alternativeDepth?: {
    mode: DepthMode;
    label: string;
    estimatedMinutes: number;
  } | null;
  onSelectAlternative?: (mode: DepthMode) => void;
  onUpgrade?: () => void;
  onDismiss: () => void;
}

export function QuotaWarningSheet({
  visible,
  minutesRemaining,
  neededMinutes,
  currentDepth,
  alternativeDepth,
  onSelectAlternative,
  onUpgrade,
  onDismiss,
}: QuotaWarningSheetProps) {
  if (!visible) return null;

  const depthTitle =
    currentDepth === 'quick'
      ? 'Quick Breakdown'
      : currentDepth === 'standard'
      ? 'Standard Summary'
      : 'Deep Dive';

  const remainingStr = formatMinutes(Math.max(0, minutesRemaining));
  const neededStr = formatMinutes(neededMinutes);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={s.backdrop}>
        <Pressable style={s.scrim} onPress={onDismiss} />

        <View style={s.sheetContainer}>
          <GlassCard style={s.sheetCard} padding={22} borderRadius={24}>
            {/* Header / Close */}
            <View style={s.topRow}>
              <View style={s.badge}>
                <Hourglass size={14} color="#FFB300" strokeWidth={2.5} />
                <Text variant="caption" rawColor="#FFB300" style={s.badgeText}>
                  MONTHLY QUOTA LIMIT
                </Text>
              </View>
              <Pressable onPress={onDismiss} hitSlop={12} style={s.closeBtn}>
                <X size={18} color="#B5C4CC" strokeWidth={2} />
              </Pressable>
            </View>

            {/* Mascot Centerpiece */}
            <View style={s.mascotRow}>
              <Mascot pose="hourglass" size={68} />
            </View>

            {/* Title & Honest Message */}
            <Text variant="title3" rawColor="#F4F7F2" style={s.title}>
              Almost Out of Minutes
            </Text>
            <Text variant="subhead" rawColor="#B5C4CC" style={s.message}>
              You have <Text variant="subhead" rawColor="#8EF20F" style={s.highlight}>{remainingStr}</Text> left this month. This {depthTitle} needs about <Text variant="subhead" rawColor="#F4F7F2" style={s.highlight}>{neededStr}</Text>.
            </Text>

            {/* Action Buttons */}
            <View style={s.actionStack}>
              {alternativeDepth && onSelectAlternative && (
                <Pressable
                  style={s.altDepthBtn}
                  onPress={() => onSelectAlternative(alternativeDepth.mode)}
                >
                  <ArrowDown size={16} color="#8EF20F" />
                  <Text variant="subhead" rawColor="#8EF20F" style={{ fontWeight: '700' }}>
                    Switch to {alternativeDepth.label} (~{formatMinutes(alternativeDepth.estimatedMinutes)})
                  </Text>
                </Pressable>
              )}

              {onUpgrade && (
                <ShinyButton
                  label="UPGRADE TO PRO"
                  variant="primary"
                  size="md"
                  fullWidth
                  icon={<Sparkles size={16} color="#09161B" />}
                  onPress={onUpgrade}
                  style={{ marginBottom: 8 }}
                />
              )}

              <ShinyButton
                label="Cancel"
                variant="secondary"
                size="md"
                fullWidth
                onPress={onDismiss}
              />
            </View>
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 12, 16, 0.75)',
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    width: '100%',
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  sheetCard: {
    width: '100%',
    backgroundColor: '#0F222A',
    borderColor: 'rgba(255, 179, 0, 0.35)',
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 179, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 0, 0.3)',
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  closeBtn: {
    padding: 4,
  },
  mascotRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  highlight: {
    fontWeight: '700',
  },
  actionStack: {
    width: '100%',
    gap: 10,
  },
  altDepthBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(142, 242, 15, 0.08)',
    borderWidth: 1.2,
    borderColor: 'rgba(142, 242, 15, 0.35)',
    marginBottom: 4,
  },
});
