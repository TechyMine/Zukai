/**
 * ZUKAI — Library Screen (Phase 7B Compact Polish)
 * Connected to live Supabase data layer via TanStack Query.
 * Single row of filter chips, sort modal, 60–64dp document rows with clear metadata,
 * language & depth chips, inline favorite star, 3-dot action sheet, and MP3 export.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Share,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  FileText,
  ChevronRight,
  Search,
  RefreshCw,
  MoreVertical,
  Edit2,
  Trash2,
  Star,
  SlidersHorizontal,
  Download,
  Share2,
  RotateCcw,
  Check,
  X,
  Clock,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { Text } from '@/components/Text';
import { ShinyButton } from '@/components/ShinyButton';
import { EmptyState } from '@/components/EmptyState';
import { DocumentRow } from '@/components/DocumentRow';
import { useLibrary, LibraryItem } from '@/features/library/hooks/useLibrary';
import { useSoftDeleteDocument, useRestoreDocument } from '@/features/documents/hooks/useDocuments';
import { updateDocumentTitle } from '@/features/documents/api/documentsApi';
import { useQueryClient } from '@tanstack/react-query';
import { usePlaybackStore } from '@/features/playback/playbackStore';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';
import {
  getDownloadsIndex,
  downloadTrackForOffline,
  deleteDownloadedTrack,
} from '@/features/playback/downloadManager';
import { getSignedAudioUrl } from '@/features/tracks/api/tracksApi';
import { useCreateAudioJob } from '@/features/jobs/hooks/useJob';

const C = {
  brandHero: '#8EF20F',
  canvasSurface: '#0B1418',
  canvasSurfaceRaised: '#12191E',
  canvasSurfaceHighlight: 'rgba(255, 255, 255, 0.08)',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textTertiary: '#6B828F',
  textInverse: '#0B1418',
  success: '#00E676',
  warning: '#FFD600',
  error: '#FF5252',
};

const FILTERS = ['All', 'Ready', 'Processing', 'Failed', 'Downloaded', 'Favorites'];

type SortBy = 'newest' | 'oldest' | 'name' | 'duration';
const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'name', label: 'Alphabetical (A-Z)' },
  { key: 'duration', label: 'Audio Duration' },
];

function formatDate(iso: string): string {
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
    return 'Recent';
  }
}

export default function LibraryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { playTrack } = usePlaybackStore();
  const createJobMutation = useCreateAudioJob();
  const softDeleteMutation = useSoftDeleteDocument();
  const restoreMutation = useRestoreDocument();

  // Search & Filter state
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort state
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [showSortModal, setShowSortModal] = useState(false);

  // Favorites state
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // Downloads state
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const { data: libraryItems = [], isLoading, error, refetch } = useLibrary();
  const [refreshing, setRefreshing] = useState(false);

  // Undo delete state
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch().catch(() => {});
    setRefreshing(false);
  };

  const handleUndoDelete = async () => {
    if (!undoToast) return;
    try {
      await restoreMutation.mutateAsync(undoToast.id);
      setUndoToast(null);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    } catch (err: any) {
      Alert.alert('Undo Failed', err?.message || 'Could not restore document');
    }
  };

  // Selected item for action sheet / modal
  const [actionItem, setActionItem] = useState<LibraryItem | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);
  const [isExportingMp3, setIsExportingMp3] = useState(false);

  // Load favorites on mount
  useEffect(() => {
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      supabase
        .from('document_favorites')
        .select('document_id')
        .eq('user_id', userId)
        .then(({ data }) => {
          if (data) setFavoriteIds(new Set(data.map((r: { document_id: string }) => r.document_id)));
        });
    }
  }, []);

  // Load downloaded track IDs on mount
  const refreshDownloads = async () => {
    const index = await getDownloadsIndex();
    setDownloadedIds(new Set(Object.keys(index)));
  };

  useEffect(() => {
    refreshDownloads();
  }, []);

  async function toggleFavorite(documentId: string) {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    const isFav = favoriteIds.has(documentId);
    const next = new Set(favoriteIds);
    if (isFav) {
      next.delete(documentId);
      setFavoriteIds(next);
      await supabase.from('document_favorites').delete().eq('user_id', userId).eq('document_id', documentId);
    } else {
      next.add(documentId);
      setFavoriteIds(next);
      await supabase.from('document_favorites').insert({ user_id: userId, document_id: documentId });
    }
  }

  // Handle Download Toggle
  async function handleToggleDownload(item: LibraryItem) {
    if (!item.track) return;
    const trackId = item.track.id;

    if (downloadedIds.has(trackId)) {
      await deleteDownloadedTrack(trackId);
      await refreshDownloads();
      Alert.alert('Offline Storage', 'Track removed from offline downloads.');
    } else {
      setDownloadingIds((prev) => new Set(prev).add(trackId));
      try {
        await downloadTrackForOffline(item.track, item.document.title);
        await refreshDownloads();
        Alert.alert('Offline Storage', 'Track saved for offline listening.');
      } catch (err: any) {
        Alert.alert('Download Failed', err?.message || 'Could not download track');
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
      }
    }
  }

  // Handle Export MP3
  async function handleExportMp3(item: LibraryItem) {
    if (!item.track) {
      Alert.alert('Export MP3', 'This document does not have a ready MP3 audio track yet.');
      return;
    }

    try {
      setIsExportingMp3(true);
      const signedUrl = await getSignedAudioUrl(item.track.storage_path);
      const safeTitle = item.document.title.replace(/[^a-zA-Z0-9_-]/g, '_');
      const tempUri = `${FileSystem.cacheDirectory}${safeTitle}.mp3`;

      // Download file to temp cache
      const dl = await FileSystem.downloadAsync(signedUrl, tempUri);
      if (dl.status === 200) {
        await Share.share({
          title: `${item.document.title} - Zukai Audio`,
          message: `Listen to "${item.document.title}" audio explanation on Zukai:`,
          url: dl.uri,
        });
      } else {
        throw new Error('Failed to download audio for export.');
      }
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Unable to export MP3 audio.');
    } finally {
      setIsExportingMp3(false);
      setActionItem(null);
    }
  }

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    let items = libraryItems.filter((item) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.document.title.toLowerCase().includes(query);
        const matchesFilename = item.document.original_filename.toLowerCase().includes(query);
        if (!matchesTitle && !matchesFilename) return false;
      }

      // 2. Filter Chip
      if (activeFilter === 'Ready') {
        return item.document.status === 'ready' && Boolean(item.track);
      }
      if (activeFilter === 'Processing') {
        return item.document.status === 'uploaded' || item.document.status === 'uploading';
      }
      if (activeFilter === 'Failed') {
        return item.document.status === 'failed';
      }
      if (activeFilter === 'Downloaded') {
        return item.track && downloadedIds.has(item.track.id);
      }
      if (activeFilter === 'Favorites') {
        return favoriteIds.has(item.document.id);
      }

      return true;
    });

    // Sort items
    items = [...items].sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.document.created_at).getTime() - new Date(a.document.created_at).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.document.created_at).getTime() - new Date(b.document.created_at).getTime();
      }
      if (sortBy === 'name') {
        return a.document.title.localeCompare(b.document.title);
      }
      if (sortBy === 'duration') {
        return (b.track?.duration_seconds ?? 0) - (a.track?.duration_seconds ?? 0);
      }
      return 0;
    });

    return items;
  }, [libraryItems, searchQuery, activeFilter, downloadedIds, favoriteIds, sortBy]);

  // Rename Handler
  const handleSaveRename = async () => {
    if (!actionItem || !renameText.trim()) return;
    try {
      setIsSubmittingRename(true);
      await updateDocumentTitle(actionItem.document.id, renameText.trim());
      setIsRenameOpen(false);
      setActionItem(null);
      queryClient.invalidateQueries({ queryKey: ['library'] });
    } catch (err: any) {
      Alert.alert('Rename Error', err?.message || 'Unable to update title');
    } finally {
      setIsSubmittingRename(false);
    }
  };

  // Delete Handler
  const handleDeleteDocument = (item: LibraryItem) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${item.document.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteMutation.mutateAsync(item.document.id);
              setActionItem(null);
              setUndoToast({ id: item.document.id, title: item.document.title });
              if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
              undoTimeoutRef.current = setTimeout(() => {
                setUndoToast(null);
              }, 5000);
            } catch (err: any) {
              Alert.alert('Delete Error', err?.message || 'Unable to delete');
            }
          },
        },
      ]
    );
  };

  // Retry / Regenerate Handler
  const handleRegenerateAudio = async (item: LibraryItem) => {
    try {
      const newJob = await createJobMutation.mutateAsync({
        documentId: item.document.id,
        language: 'english',
        depth: 'standard',
        voice: 'Aoede',
      });
      setActionItem(null);
      router.push(`/processing/${newJob.id}` as any);
    } catch (err: any) {
      Alert.alert('Regeneration Error', err?.message || 'Failed to start job');
    }
  };

  return (
    <ScreenContainer
      meshVariant="library"
      hasTabBar
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={C.brandHero}
          colors={[C.brandHero]}
        />
      }
    >
      {/* 1. Header with Sort & Refresh */}
      <View style={styles.header}>
        <Text variant="headline" rawColor={C.textPrimary} style={styles.headerTitle}>
          My Library ({libraryItems.length})
        </Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => setShowSortModal(true)}
            accessibilityLabel="Sort documents"
          >
            <SlidersHorizontal size={18} color={C.textSecondary} strokeWidth={2} />
          </Pressable>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => refetch()}
            accessibilityLabel="Refresh library"
          >
            <RefreshCw size={18} color={C.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* 2. Search Bar (Height 44) */}
      <View style={styles.searchBar}>
        <Search size={18} color={C.brandHero} strokeWidth={2} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search documents by title..."
          placeholderTextColor={C.textTertiary}
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <X size={16} color={C.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* 3. Single Row of Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}
      >
        {FILTERS.map((f) => {
          const active = activeFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            >
              <Text
                variant="caption"
                rawColor={active ? C.textInverse : C.textSecondary}
                style={styles.chipText}
              >
                {f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 4. Loading State */}
      {isLoading && (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={C.brandHero} />
          <Text variant="subhead" rawColor={C.textSecondary} style={{ marginTop: 12 }}>
            Loading your documents...
          </Text>
        </View>
      )}

      {/* 5. Error State */}
      {error && !isLoading && (
        <GlassCard style={styles.errorCard} padding={14}>
          <Text variant="headline" rawColor={C.error}>Unable to load library</Text>
          <Text variant="footnote" rawColor={C.textTertiary} style={{ marginTop: 4, marginBottom: 12 }}>
            {error.message || 'Check your internet connection and try again.'}
          </Text>
          <ShinyButton
            label="Retry"
            size="sm"
            variant="secondary"
            icon={<RefreshCw size={14} color={C.textPrimary} />}
            onPress={() => refetch()}
          />
        </GlassCard>
      )}

      {/* 6. Document Rows (Standardized DocumentRow) */}
      {!isLoading && !error && filteredItems.length > 0 && (
        <View style={styles.listContainer}>
          {filteredItems.map((item) => {
            const isReady = item.document.status === 'ready' && Boolean(item.track);
            const isFailed = item.document.status === 'failed';
            const isProcessing = item.document.status === 'uploaded' || item.document.status === 'uploading';
            const isFav = favoriteIds.has(item.document.id);

            return (
              <DocumentRow
                key={item.document.id}
                title={item.document.title}
                originalFilename={item.document.original_filename}
                mimeType={item.document.mime_type}
                fileSizeBytes={item.document.file_size_bytes}
                durationSeconds={item.track?.duration_seconds}
                pageCount={item.document.page_count}
                createdAt={item.document.created_at}
                status={item.document.status}
                isFavorite={isFav}
                variant="full"
                onPress={() => {
                  if (isReady && item.track) {
                    playTrack(item.track, item.document.title);
                    router.push('/player' as any);
                  } else if (isProcessing) {
                    router.push('/(tabs)/home');
                  } else if (isFailed) {
                    handleRegenerateAudio(item);
                  }
                }}
                onToggleFavorite={() => toggleFavorite(item.document.id)}
                onMenuPress={() => setActionItem(item)}
              />
            );
          })}
        </View>
      )}

      {/* 7. Empty State */}
      {!isLoading && !error && filteredItems.length === 0 && (
        <EmptyState
          pose="empty"
          title={searchQuery ? 'No documents found' : 'No documents in this view'}
          message={
            searchQuery
              ? 'Try searching with a different title or keyword.'
              : 'Upload a PDF or Word document to get started.'
          }
          actionLabel="Upload Document"
          onAction={() => router.push('/(tabs)/upload')}
        />
      )}

      {/* ── Sort Options Modal ── */}
      <Modal visible={showSortModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortModal(false)}>
          <View style={styles.modalContent}>
            <Text variant="headline" rawColor={C.textPrimary} style={{ marginBottom: 12 }}>
              Sort Documents
            </Text>
            {SORT_OPTIONS.map((opt) => {
              const selected = sortBy === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    setSortBy(opt.key);
                    setShowSortModal(false);
                  }}
                  style={[styles.sortRow, selected && styles.sortRowSelected]}
                >
                  <Text variant="subhead" rawColor={selected ? C.brandHero : C.textPrimary}>
                    {opt.label}
                  </Text>
                  {selected && <Check size={18} color={C.brandHero} strokeWidth={2.5} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* ── Document Actions Action Sheet ── */}
      <Modal visible={Boolean(actionItem)} transparent animationType="slide">
        <Pressable style={styles.actionSheetOverlay} onPress={() => setActionItem(null)}>
          <View style={styles.actionSheetContent}>
            <View style={styles.actionSheetHandle} />
            <Text variant="headline" rawColor={C.textPrimary} numberOfLines={1} style={{ marginBottom: 4 }}>
              {actionItem?.document.title}
            </Text>
            <Text variant="caption" rawColor={C.textTertiary} style={{ marginBottom: 16 }}>
              {actionItem?.document.original_filename}
            </Text>

            {/* Quick Rename */}
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                setRenameText(actionItem?.document.title || '');
                setIsRenameOpen(true);
              }}
            >
              <Edit2 size={18} color={C.textSecondary} strokeWidth={2} />
              <Text variant="subhead" rawColor={C.textPrimary} style={{ marginLeft: 12, flex: 1 }}>
                Rename Document
              </Text>
            </Pressable>

            {/* Export MP3 */}
            {actionItem?.track && (
              <Pressable
                style={styles.sheetItem}
                onPress={() => handleExportMp3(actionItem)}
                disabled={isExportingMp3}
              >
                {isExportingMp3 ? (
                  <ActivityIndicator size="small" color={C.brandHero} />
                ) : (
                  <Share2 size={18} color={C.brandHero} strokeWidth={2} />
                )}
                <Text variant="subhead" rawColor={C.brandHero} style={{ marginLeft: 12, flex: 1, fontWeight: '700' }}>
                  {isExportingMp3 ? 'Exporting MP3...' : 'Export MP3 Audio'}
                </Text>
              </Pressable>
            )}

            {/* Download / Remove Offline */}
            {actionItem?.track && (
              <Pressable
                style={styles.sheetItem}
                onPress={() => {
                  handleToggleDownload(actionItem);
                  setActionItem(null);
                }}
              >
                <Download size={18} color={C.textSecondary} strokeWidth={2} />
                <Text variant="subhead" rawColor={C.textPrimary} style={{ marginLeft: 12, flex: 1 }}>
                  {downloadedIds.has(actionItem.track.id) ? 'Remove from Offline' : 'Download for Offline'}
                </Text>
              </Pressable>
            )}

            {/* Regenerate Audio */}
            <Pressable
              style={styles.sheetItem}
              onPress={() => handleRegenerateAudio(actionItem!)}
            >
              <RotateCcw size={18} color={C.textSecondary} strokeWidth={2} />
              <Text variant="subhead" rawColor={C.textPrimary} style={{ marginLeft: 12, flex: 1 }}>
                Regenerate Audio Explanation
              </Text>
            </Pressable>

            {/* Delete Document */}
            <Pressable
              style={[styles.sheetItem, { borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)', marginTop: 8 }]}
              onPress={() => handleDeleteDocument(actionItem!)}
            >
              <Trash2 size={18} color={C.error} strokeWidth={2} />
              <Text variant="subhead" rawColor={C.error} style={{ marginLeft: 12, flex: 1 }}>
                Delete Document
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Rename Modal ── */}
      <Modal visible={isRenameOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setIsRenameOpen(false)}>
          <View style={styles.modalContent}>
            <Text variant="headline" rawColor={C.textPrimary} style={{ marginBottom: 12 }}>
              Rename Document
            </Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              style={styles.renameInput}
              autoFocus
              placeholder="Enter new title"
              placeholderTextColor={C.textTertiary}
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelBtn} onPress={() => setIsRenameOpen(false)}>
                <Text variant="subhead" rawColor={C.textSecondary}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, isSubmittingRename && { opacity: 0.6 }]}
                onPress={handleSaveRename}
                disabled={isSubmittingRename}
              >
                {isSubmittingRename ? (
                  <ActivityIndicator size="small" color={C.textInverse} />
                ) : (
                  <Text variant="subhead" rawColor={C.textInverse} style={{ fontWeight: '700' }}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* 5-Second Undo Delete Toast */}
      {undoToast && (
        <View style={styles.undoToastContainer}>
          <Text variant="subhead" rawColor={C.textPrimary} numberOfLines={1} style={{ flex: 1 }}>
            Deleted "{undoToast.title}"
          </Text>
          <Pressable onPress={handleUndoDelete} style={styles.undoButton}>
            <RotateCcw size={14} color={C.textInverse} strokeWidth={2.5} />
            <Text variant="caption" rawColor={C.textInverse} style={{ fontWeight: '700', marginLeft: 4 }}>
              UNDO
            </Text>
          </Pressable>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontWeight: '800',
    fontSize: 18,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    width: '100%',
    alignSelf: 'stretch',
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12191E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: '#F4F7F2',
    fontSize: 13,
  },
  chipsScroll: {
    maxHeight: 34,
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 16,
  },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#8EF20F',
  },
  chipInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipText: {
    fontWeight: '700',
    fontSize: 11,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  errorCard: {
    marginVertical: 12,
  },
  listContainer: {
    gap: 8,
  },
  rowPressable: {
    marginBottom: 2,
  },
  docRow: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
  },
  docIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(142, 242, 15, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(142, 242, 15, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  docCenterCol: {
    flex: 1,
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    fontSize: 10,
    color: '#6B828F',
  },
  docRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 6,
  },
  chipsCluster: {
    alignItems: 'flex-end',
    gap: 2,
  },
  tagPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  tagText: {
    fontSize: 8,
    fontWeight: '700',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  statusPillText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  actionBtn: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#12191E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 18,
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  sortRowSelected: {
    backgroundColor: 'rgba(142, 242, 15, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  actionSheetContent: {
    backgroundColor: '#12191E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 18,
    paddingBottom: 36,
  },
  actionSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  renameInput: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    color: '#F4F7F2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  saveBtn: {
    backgroundColor: '#8EF20F',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoToastContainer: {
    position: 'absolute',
    bottom: 84,
    left: 16,
    right: 16,
    backgroundColor: '#18333D',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  undoButton: {
    backgroundColor: '#8EF20F',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 12,
  },
});
