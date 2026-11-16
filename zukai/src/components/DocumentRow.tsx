/**
 * ZUKAI SHARED DOCUMENT ROW
 * Location: /zukai/src/components/DocumentRow.tsx
 * Standardized 64dp+ horizontal document row used across Home, Library, History,
 * Downloads, and search results.
 * Strictly adheres to Phase 7C layout specification:
 * - 40x40 centered file-type icon tile on the left
 * - flex: 1, minWidth: 0 middle container with 1-line title, meta line, and wrapping chips row
 * - Vertically centered right action cluster with 48dp hitSlop touch targets
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import {
  FileText,
  Star,
  MoreVertical,
  ChevronRight,
  BookOpen,
  FileSpreadsheet,
} from 'lucide-react-native';
import { GlassCard } from './GlassCard';
import { Text } from './Text';

export interface DocumentRowProps {
  title: string;
  originalFilename?: string;
  mimeType?: string;
  fileSizeBytes?: number | null;
  durationSeconds?: number | null;
  pageCount?: number | null;
  createdAt?: string;
  status: 'ready' | 'processing' | 'queued' | 'failed' | 'uploaded' | 'uploading' | 'waiting_for_capacity' | string;
  language?: 'english' | 'hinglish' | string;
  depth?: 'quick' | 'standard' | 'deep' | string;
  isFavorite?: boolean;
  isDownloaded?: boolean;
  onPress?: () => void;
  onToggleFavorite?: () => void;
  onMenuPress?: () => void;
  variant?: 'full' | 'home';
}

const C = {
  brandHero: '#8EF20F',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  success: '#00E676',
  warning: '#FFD600',
  orange: '#FF9500',
  error: '#FF5252',
  accentPdf: '#FF4D4D',
  accentDocx: '#38BDF8',
  accentPptx: '#F59E0B',
  accentTxt: '#8EF20F',
};

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

function formatDuration(seconds?: number | null, pageCount?: number | null): string {
  if (seconds && seconds > 0) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  if (pageCount && pageCount > 0) {
    return `${pageCount} pg${pageCount > 1 ? 's' : ''}`;
  }
  return '—';
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${month} ${day}, ${hour12}:${minutes} ${ampm}`;
  } catch {
    return '';
  }
}

export function DocumentRow({
  title,
  originalFilename,
  mimeType = '',
  fileSizeBytes,
  durationSeconds,
  pageCount,
  createdAt,
  status,
  language,
  depth,
  isFavorite = false,
  onPress,
  onToggleFavorite,
  onMenuPress,
  variant = 'full',
}: DocumentRowProps) {
  // Determine file type and theme
  const ext = (originalFilename?.split('.').pop() || mimeType || '').toLowerCase();
  let typeLabel = 'PDF';
  let typeTint = C.accentPdf;

  if (ext.includes('doc') || ext.includes('word')) {
    typeLabel = 'DOCX';
    typeTint = C.accentDocx;
  } else if (ext.includes('ppt') || ext.includes('presentation')) {
    typeLabel = 'PPTX';
    typeTint = C.accentPptx;
  } else if (ext.includes('txt') || ext.includes('plain')) {
    typeLabel = 'TXT';
    typeTint = C.accentTxt;
  }

  // Determine status chip
  let statusLabel = 'QUEUED';
  let statusColor = C.warning;

  if (status === 'ready') {
    statusLabel = 'READY';
    statusColor = C.success;
  } else if (status === 'failed') {
    statusLabel = 'FAILED';
    statusColor = C.error;
  } else if (status === 'waiting_for_capacity') {
    statusLabel = 'WAITING';
    statusColor = C.orange;
  } else if (status === 'extracting' || status === 'scripting' || status === 'voicing' || status === 'assembling' || status === 'uploading' || status === 'uploaded') {
    statusLabel = 'PROCESSING';
    statusColor = C.brandHero;
  }

  // Language & depth determination
  const isHinglish = language === 'hinglish' || title.toLowerCase().includes('hinglish');
  const langLabel = isHinglish ? 'HINGLISH' : 'EN';
  const depthLabel = depth ? depth.toUpperCase() : null;

  // Meta line builder
  const metaParts: string[] = [typeLabel, formatFileSize(fileSizeBytes)];
  const durationStr = formatDuration(durationSeconds, pageCount);
  if (durationStr !== '—') metaParts.push(durationStr);
  const dateStr = formatDate(createdAt);
  if (dateStr) metaParts.push(dateStr);
  const metaLine = metaParts.join(' • ');

  return (
    <GlassCard borderRadius={16} padding={0} style={styles.cardWrapper}>
      <Pressable
        onPress={onPress}
        style={styles.rowContainer}
        accessibilityRole="button"
        accessibilityLabel={`Document ${title}`}
      >
        {/* LEFT: 40x40 centered file-type icon tile */}
        <View style={[styles.iconTile, { backgroundColor: `${typeTint}15`, borderColor: `${typeTint}30` }]}>
          <FileText size={20} color={typeTint} strokeWidth={2.2} />
        </View>

        {/* MIDDLE: Title, Meta, and Wrapping Chips */}
        <View style={styles.middleCol}>
          {/* Title (1 line, ellipsis, 15/20 semibold) */}
          <Text
            variant="headline"
            rawColor={C.textPrimary}
            numberOfLines={1}
            ellipsizeMode="tail"
            style={styles.titleText}
          >
            {title}
          </Text>

          {/* Meta line (13/16 secondary) */}
          <Text
            variant="caption"
            rawColor={C.textSecondary}
            numberOfLines={1}
            ellipsizeMode="tail"
            style={styles.metaText}
          >
            {metaLine}
          </Text>

          {/* Wrapping Chips Row (22dp tall) */}
          <View style={styles.chipsRow}>
            {/* Status Chip */}
            <View style={[styles.chip, { backgroundColor: `${statusColor}18`, borderColor: `${statusColor}40` }]}>
              <Text variant="caption" rawColor={statusColor} style={styles.chipText}>
                {statusLabel}
              </Text>
            </View>

            {/* Language Chip */}
            <View style={[styles.chip, styles.langChip]}>
              <Text variant="caption" rawColor="#A2B4BE" style={styles.chipText}>
                {langLabel}
              </Text>
            </View>

            {/* Depth Chip (if provided) */}
            {depthLabel && (
              <View style={[styles.chip, styles.depthChip]}>
                <Text variant="caption" rawColor={C.brandHero} style={styles.chipText}>
                  {depthLabel}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* RIGHT: Vertically centered action cluster */}
        <View style={styles.rightCluster}>
          {variant === 'home' ? (
            <ChevronRight size={20} color={C.textTertiary} strokeWidth={2} />
          ) : (
            <>
              {onToggleFavorite && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onToggleFavorite();
                  }}
                  hitSlop={12}
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={isFavorite ? 'Unfavorite' : 'Favorite'}
                >
                  <Star
                    size={20}
                    color={isFavorite ? '#FFD600' : C.textTertiary}
                    fill={isFavorite ? '#FFD600' : 'transparent'}
                    strokeWidth={2}
                  />
                </Pressable>
              )}

              {onMenuPress && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onMenuPress();
                  }}
                  hitSlop={12}
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Document options"
                >
                  <MoreVertical size={20} color={C.textSecondary} strokeWidth={2} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </Pressable>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginBottom: 8,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
    minHeight: 64,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  middleCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  metaText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#A2B4BE',
    marginTop: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5,
  },
  chip: {
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  depthChip: {
    backgroundColor: 'rgba(142, 242, 15, 0.10)',
    borderColor: 'rgba(142, 242, 15, 0.25)',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rightCluster: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
  },
  actionBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
