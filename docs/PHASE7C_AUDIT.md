# Phase 7C Completion Audit: Layout Root Cause & Multi-Model Quota Router

**Execution Date:** November 15, 2026  
**Status:** All Part 1 and Part 2 Deliverables Verified & Tested  
**Test Suites:**
- Mobile App (`zukai`): **8 / 8 suites passed (55 / 55 tests)**
- Backend Worker (`worker`): **8 / 8 suites passed (23 / 23 tests)**
- TypeScript Diagnostics: **0 errors** across both projects (`tsc --noEmit`)

---

## 1. Summary of Problems Fixed & Root Cause Analysis

### Problem A: Document Rows Missing Titles & Metadata (Layout Collapse)
- **Observed Behavior:** On Home (Recent documents) and Library screens, rows rendered file icons and chips but completely lacked document titles, file sizes, durations, and dates. Status chips were clipped at the bottom.
- **Root Cause Discovered:** `GlassCard.tsx` applied caller styles (e.g. `flexDirection: 'row'`, `height: 60`, `alignItems: 'center'`) to an outer container, while enclosing children inside an inner `<View style={contentPaddingStyle}>` with default `flexDirection: 'column'`. Children within fixed-height row wrappers were forced into a column layout, pushing the middle `flex: 1` text container out of the layout bounds or collapsing its dimensions to zero.
- **Root Cause Fix:**
  1. Refactored `GlassCard.tsx`: Made background visual effects (`BlurView`, deep glass views, linear gradients) absolute fill layers with `pointerEvents="none"`. Children are now direct flex children of `styles.container`.
  2. Implemented `<DocumentRow>`: A single, shared component (`zukai/src/components/DocumentRow.tsx`) used across Home Recent, Library, History, Downloads, and Search. It uses horizontal row layout, 40x40 icon tile, middle `flex: 1` container with 1-line title and wrapping 22dp chips row, and right vertically centered 48dp hitSlop buttons. `height: 'auto'`, `minHeight: 64`.

### Problem B: Stray Elements & Tab Bar Collisions
- **Observed Behavior:** Stray mascot and caption rendered underneath the floating tab bar on Home; scrolled content collided with the Android status bar clock and battery icons.
- **Root Cause & Fix:**
  1. Removed absolute-positioned bottom footer in `home.tsx` that was sitting behind the tab bar; replaced it with a dismissible `MascotTip` card inside the ScrollView.
  2. Added status-bar linear gradient scrim (`rgba(9, 22, 27, 0.95)` to `transparent`, height `insets.top + 20`) in `ScreenContainer.tsx` to prevent content collision with status bar icons.
  3. Increased bottom clearance to `TAB_BAR_HEIGHT + insets.bottom + 24` so content is always fully scrollable above the floating bar.

### Problem C: Single-Model Quota Exhaustion & Rate Limits
- **Observed Behavior:** Free-tier Gemini models (e.g., Gemini 3.6 Flash at 20 RPD) hit rate limits and caused jobs to remain stuck or fail.
- **Root Cause & Fix:**
  1. Created editable registry `/worker/src/ai/modelsConfig.json` covering 13 models across Text, TTS, and Live Audio families with explicit limits (RPM, TPM, RPD, Max Concurrent).
  2. Implemented `quotaTracker.ts`: Real-time sliding-window rate tracking (RPM/TPM) and daily RPD reset at Pacific Midnight (00:00 PST / 08:00 UTC).
  3. Implemented `router.ts`: Quota-aware router dispatching tasks across prioritized fallback chains. 429 errors automatically trigger cooldown and fallback to the next available model without failing jobs.
  4. Implemented `liveAudioProvider.ts`: Live Audio dialog fallback with Levenshtein Word Error Rate (WER) verbatim guard ($\le 8\%$).
  5. Implemented `artifactManager.ts`: Checkpointing of intermediate artifacts (`extracted_text`, `outline`, `script`, `audio_chunk`) and SHA-256 deduplication.
  6. Added `waiting_for_capacity` state handling in mobile UI (`processing/[jobId].tsx`, `rpcErrors.ts`, and `DocumentRow.tsx`).

---

## 2. Test Execution Evidence

### Mobile Test Suite (`zukai`)
```bash
> zukai@1.0.0 test
> jest

PASS __tests__/authErrors.test.ts (6.488 s)
PASS __tests__/authSchemas.test.ts (6.814 s)
PASS __tests__/documentRow.test.tsx (6.861 s)
PASS __tests__/rpcErrors.test.ts (7.256 s)
PASS __tests__/uploadValidation.test.ts (7.29 s)
PASS __tests__/playbackStore.test.ts (7.864 s)
PASS __tests__/authState.test.ts (7.958 s)
PASS __tests__/uploadManager.test.ts (8.123 s)

Test Suites: 8 passed, 8 total
Tests:       55 passed, 55 total
Snapshots:   0 total
Time:        9.165 s
Ran all test suites.
```

### Worker Test Suite (`worker`)
```bash
> zukai-worker@1.0.0 test
> tsx --test test/*.test.ts

TAP version 13
ok 1 - Worker Text Extraction
ok 2 - Speech Synthesis & Karaoke Alignment
ok 3 - Magic Byte File Validation
ok 4 - Text Normalization & Prompt Sanitization
ok 5 - Error Mapping & Accounting
ok 6 - Quota-Aware Model Registry & Tracking
ok 7 - Multi-Model Fallback Router
ok 8 - Verbatim Guard & Content Hashing

1..8
# tests 23
# suites 8
# pass 23
# fail 0
# duration_ms 824.1608
```

### Quota Status CLI (`worker`)
```bash
> zukai-worker@1.0.0 quota:status
> tsx src/scripts/quotaStatus.ts

========================================================================================
                          ZUKAI GEMINI MULTI-MODEL QUOTA STATUS                         
========================================================================================

Daily Quota Reset Window: Pacific Midnight (00:00 PST / 08:00 UTC)
Next Daily Reset:        2026-11-16T08:00:00.000Z (~15.2h remaining)
Active Task Pipelines:   outline (gemini-2.5-flash -> gemini-3.6-flash -> gemini-3.8-flash -> ...)
                         script  (gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> ...)
                         voice   (gemini-2.5-flash-preview-tts -> gemini-2.5-flash-live -> ...)
----------------------------------------------------------------------------------------

┌─────────┬────────────────────────────────┬──────────────┬────────────┬──────────┬─────────────┬────────────┬────────┐
│ (index) │ Model ID                       │ Kind         │ Status     │ RPM (1m) │ TPM (1m)    │ RPD (Day)  │ Active │
├─────────┼────────────────────────────────┼──────────────┼────────────┼──────────┼─────────────┼────────────┼────────┤
│ 0       │ 'gemini-2.5-flash'             │ 'text'       │ 'READY'    │ '0/5'    │ '0/250000'  │ '0/20'     │ 0      │
│ 1       │ 'gemini-3.6-flash'             │ 'text'       │ 'READY'    │ '0/5'    │ '0/250000'  │ '0/20'     │ 0      │
│ 2       │ 'gemini-3.8-flash'             │ 'text'       │ 'READY'    │ '0/5'    │ '0/250000'  │ '0/20'     │ 0      │
│ 3       │ 'gemini-3-flash'               │ 'text'       │ 'READY'    │ '0/5'    │ '0/250000'  │ '0/20'     │ 0      │
│ 4       │ 'gemini-3.5-flash-lite'        │ 'text'       │ 'READY'    │ '0/15'   │ '0/250000'  │ '0/500'    │ 0      │
│ 5       │ 'gemini-3.1-flash-lite'        │ 'text'       │ 'READY'    │ '0/15'   │ '0/250000'  │ '0/500'    │ 0      │
│ 6       │ 'gemini-2.5-flash-lite'        │ 'text'       │ 'READY'    │ '0/10'   │ '0/250000'  │ '0/20'     │ 0      │
│ 7       │ 'gemini-1.5-flash'             │ 'text'       │ 'READY'    │ '0/15'   │ '0/1000000' │ '0/1500'   │ 0      │
│ 8       │ 'gemini-2.5-flash-preview-tts' │ 'tts'        │ 'READY'    │ '0/3'    │ '0/10000'   │ '0/10'     │ 0      │
│ 9       │ 'gemini-2.5-flash-live'        │ 'live-audio' │ 'READY'    │ '0/60'   │ '0/1000000' │ '0/10000'  │ 0      │
│ 10      │ 'gemini-3-flash-live'          │ 'live-audio' │ 'READY'    │ '0/30'   │ '0/65000'   │ '0/500'    │ 0      │
│ 11      │ 'gemini-3.8-live'              │ 'live-audio' │ 'READY'    │ '0/30'   │ '0/65000'   │ '0/500'    │ 0      │
│ 12      │ 'google-cloud-tts'             │ 'cloud-tts'  │ 'DISABLED' │ '0/300'  │ '0/1000000' │ '0/100000' │ 0      │
└─────────┴────────────────────────────────┴──────────────┴────────────┴──────────┴─────────────┴────────────┴────────┘
```

---

## 3. Database Migration Summary

Migration applied: `supabase/migrations/20261107000015_phase7c_router_and_artifacts.sql`
- Added enum value `'waiting_for_capacity'` to `job_status`.
- Created table `public.model_quotas` for persistent worker quota state tracking.
- Created table `public.job_artifacts` for intermediate pipeline checkpointing (`extracted_text`, `outline`, `script`, `audio_chunk`).
- Added index `idx_documents_content_sha256` for instant SHA-256 deduplication.
- Added `waiting_until` and `recheck_after` columns to `public.audio_jobs`.
