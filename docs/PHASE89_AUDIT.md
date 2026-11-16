# Phase 8+9 Audit

Generated: 2026-11-17  
Auditor: Senior Engineer pre-implementation review

---

## Summary

| Area | Exists | Works | Broken / Missing |
|---|---|---|---|
| Player screen | ✅ player.tsx (842 lines) | Partial | Sleep timer, speed, waveform not wired; no background service |
| Mini-player | ✅ GlobalMiniPlayer.tsx | Partial | No artwork; thin progress line wired; waveform decorative |
| Notification controls | ❌ | — | Entirely missing; expo-audio has no native notification control |
| Chapters UI | ✅ in player.tsx | Partial | Chapter jump works; transcript binary-search missing |
| Transcript | ✅ in player.tsx | Partial | Linear scan O(n) not binary search; FlashList not used |
| Progress sync | ✅ playbackApi + store | Partial | No device_id; no offline queue; no stale-write rejection |
| Downloads | ✅ downloadManager.ts | Partial | No concurrency limit; no resumable download; no encryption |
| Offline playback | ✅ via getLocalAudioUri | Works | Plays offline if file exists |
| Home | ✅ home.tsx | Works mostly | In-progress jobs section present; pull-to-refresh missing |
| Library | ✅ library.tsx (830 lines) | Partial | Client-side filter/sort only; no keyset pagination; FlatList not FlashList |
| Search | ✅ in library.tsx | Works | But non-debounced, all-client |
| Filter/Sort | ✅ in library.tsx | Works | Client-side on fetched data |
| Row actions | ✅ in library.tsx | Works | Rename/delete/star present; undo toast missing |
| Pull-to-refresh | ❌ | — | Not in Home, Library, History, Downloads |
| Error boundary | ❌ | — | No root error boundary in _layout.tsx |
| Offline banner | ❌ | — | No network-state detection |
| Empty states | ✅ EmptyState component | Works | Present in Library and Home |
| Background audio | ⚠️ | Partial | expo-audio `shouldPlayInBackground:true` set but no foreground service |
| Waveform | ✅ Waveform.tsx | Decorative | No real waveform_peaks data; uses animated bars |
| Bookmarks | ✅ in player.tsx | Broken | `saveBookmark()` defined in store but no `bookmarks` table in DB |
| listening_daily | ❌ | — | No DB table; no RPC |
| waveform_peaks column | ❌ | — | Column does not exist on audio_tracks |
| sha256 column | ❌ | — | Column does not exist on audio_tracks |
| device_id on progress | ❌ | — | Column does not exist on playback_progress |
| list_documents RPC | ❌ | — | No server-side pagination; all data fetched client-side |
| request_audio_url RPC | ❌ | — | Direct storage.createSignedUrl() used instead |
| restore_document RPC | ❌ | — | No undo-delete function |
| Diagnostics logger | ❌ | — | No ring-buffer diagnostics export |

---

## Severity-ordered Fix List

### CRITICAL (data correctness)
1. **Bookmarks broken** – `saveBookmark()` calls `supabase.from('bookmarks')` which doesn't exist → runtime error every time user taps bookmark
2. **No stale-write rejection** – progress syncs from multiple devices can overwrite newer with older data
3. **No real waveform_peaks** – columns missing from audio_tracks; Waveform component uses fake animated bars

### HIGH (UX severely degraded)
4. **No pull-to-refresh** anywhere → user can't refresh stale data
5. **No root error boundary** → unhandled errors crash entire app
6. **Library loads all data** (N+1 problem: 3 separate queries) → slow with many documents
7. **Transcript linear scan** → lags on long lessons
8. **No offline mode detection / banner** → user confused when offline

### MEDIUM (incomplete features)
9. **No notification controls** (Play/Pause/Skip from lock screen) → requires foreground service  
10. **No download resumability / concurrency limit** → large downloads can fail
11. **No listening_daily tracking** → streak/goal data fabricated
12. **No keyset pagination** in Library → will slow down at scale
13. **Sleep timer state not persisted** → timer lost on background/foreground

### LOW (nice to have)
14. Missing sha256 on audio_tracks (data integrity check)
15. Missing diagnostics export
16. Missing device_id on playback_progress
17. No undo-toast on delete

---

## What Works and Should NOT Be Touched
- expo-audio integration (createAudioPlayer, setAudioModeAsync)
- Speed persistence and playback rate setting
- Chapter jumping (seekTo chapter start_seconds)
- Signed URL fetch via getSignedAudioUrl  
- Download manager file storage (documentDirectory/audio_cache/)
- Library screen filter/sort UI
- DocumentRow component
- QuotaWarningSheet, useJob Realtime fix, formatMinutes
- Worker Phase 7D router/pipeline

---

## Implementation Order (Part 1–9)
1. Part 1: DB migrations (bookmarks table, waveform_peaks, sha256, device_id, list_documents RPC, listening_daily)
2. Part 2: Player engine hardening (binary-search transcript, sleep timer persistence, repeat, bookmark fix)
3. Part 3: Player UI (waveform scrubber with real peaks data)
4. Part 4: Transcript FlashList + binary search hook
5. Part 5: Progress sync (device_id, offline queue, stale-write rejection)
6. Part 6: Downloads (concurrency 2, resumable, encryption via OS private storage)
7. Part 7: Home (pull-to-refresh, real listening_daily, error state)
8. Part 8: Library (server-side list_documents RPC, FlashList, undo delete)
9. Part 9: Error boundary, offline banner, diagnostics logger
