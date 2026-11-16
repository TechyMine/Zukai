# Zukai Gemini Multi-Model Quota & Routing Architecture

This document specifies how Zukai manages Google Gemini quotas, model hierarchies, automatic fallbacks, and task-specific rate-limit survival on a single Google project.

---

## 1. Core Principles

1. **Single Google Project & API Key**: Zukai adheres strictly to Google Terms of Service. It **never rotates API keys** or attempts to circumvent limits through multi-project pooling.
2. **Quota-Aware Model Routing**: Rate limits (RPM, TPM, RPD) are tracked in real-time. When a model approaches its limit or returns HTTP 429, requests are routed to the next model in that task's priority chain.
3. **Graceful Capacity Waiting**: If all models for a specific task are temporarily exhausted, jobs transition to `waiting_for_capacity` instead of failing. When the earliest cooldown elapses, the worker resumes the job from its last checkpoint.
4. **Intermediate Checkpointing**: Pipeline stages (`extracted_text`, `outline`, `script`, `audio_chunk`) are persisted in `job_artifacts`. Work is never repeated after rate-limit interruptions.
5. **Deterministic Deduplication**: Documents are hashed using SHA-256. Re-generating an identical document with the same settings reuses existing audio tracks instantly with 0 tokens consumed.

---

## 2. Quota Windows & Pacific Midnight Reset

Google AI Studio resets daily quota counters (**Requests Per Day / RPD**) at **00:00 PST (Pacific Standard Time)**, which corresponds to **08:00 UTC**.

- **Sliding-Window RPM / TPM**: Tracked per minute (60,000 ms sliding window).
- **Daily RPD Counter**: Automatically resets at 08:00 UTC every day via `getPacificDayStart()`.
- **429 Cooldown**: When a model encounters a 429 error, it is placed in a cooldown (default 60 seconds or parsed `Retry-After` header) before it is reconsidered by the router.
- **Circuit Breaker**: If a model fails 3 consecutive times with non-quota errors, it is suspended for 5 minutes.

---

## 3. Model Registry & Limits Configuration

The model registry is configured in an editable JSON file at `/worker/src/ai/modelsConfig.json`.

| Model ID | Family | Quality Tier | RPM | TPM | RPD | Max Concurrent |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `gemini-2.5-flash` | Text | High | 5 | 250,000 | 20 | 2 |
| `gemini-3.6-flash` | Text | High | 5 | 250,000 | 20 | 2 |
| `gemini-3.8-flash` | Text | High | 5 | 250,000 | 20 | 2 |
| `gemini-3-flash` | Text | High | 5 | 250,000 | 20 | 2 |
| `gemini-3.5-flash-lite` | Text | Medium | 15 | 250,000 | 500 | 3 |
| `gemini-3.1-flash-lite` | Text | Medium | 15 | 250,000 | 500 | 3 |
| `gemini-2.5-flash-lite` | Text | Fallback | 10 | 250,000 | 20 | 2 |
| `gemini-1.5-flash` | Text | High | 15 | 1,000,000 | 1,500 | 5 |
| `gemini-2.5-flash-preview-tts` | TTS | High | 3 | 10,000 | 10 | 1 |
| `gemini-2.5-flash-live` | Live Audio | Fallback | 60 | 1,000,000 | 10,000 | 2 |
| `gemini-3-flash-live` | Live Audio | Fallback | 30 | 65,000 | 500 | 2 |
| `gemini-3.8-live` | Live Audio | Fallback | 30 | 65,000 | 500 | 2 |
| `google-cloud-tts` | Cloud TTS | High | 300 | 1,000,000 | 100,000 | 10 |

*Note: Models like Gemini 3.5 Live Translate, Gemini 3.5 Transcribe Live, and Gemini 3.8 Live Extended Thinking are excluded as they do not support text-to-speech audio dialog generation.*

---

## 4. Pipeline Task Priorities

Each stage of audio explanation generation has its own prioritized sequence:

### Outline Generation (`outline`)
```
gemini-2.5-flash -> gemini-3.6-flash -> gemini-3.8-flash -> gemini-3-flash -> gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-1.5-flash
```
*Goal: Fast, high-reasoning structuring of document headings and core concepts.*

### Script Writing (`script`)
```
gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-2.5-flash -> gemini-3.6-flash -> gemini-3.8-flash -> gemini-3-flash -> gemini-2.5-flash-lite -> gemini-1.5-flash
```
*Goal: Conversational script drafting prioritizing the 500 RPD high-volume Flash Lite models first.*

### Voice Synthesis (`voice`)
```
gemini-2.5-flash-preview-tts -> gemini-2.5-flash-live -> gemini-3-flash-live -> gemini-3.8-live -> google-cloud-tts
```
*Goal: High-fidelity Neural TTS narration with automatic fallback to Gemini Live Audio dialog models.*

---

## 5. Live Audio Fallback & Verbatim Guard

When Neural TTS models (`gemini-2.5-flash-preview-tts`) hit daily RPD or minute RPM limits:
1. The router falls back to Gemini Live Audio models (`gemini-2.5-flash-live`).
2. Gemini Live Audio models accept `responseModalities: ['AUDIO']` with strict system instructions (`Output audio ONLY. Read the following text VERBATIM without adding, omitting, explaining, or repeating any words`).
3. Audio output is verified against the reference script using Levenshtein Word Error Rate (WER).
4. If WER $\le 0.08$ (8%), the narration is accepted and converted to 24 kHz WAV for FFmpeg mastering. If WER $> 0.08$, an automatic retry with reinforced strict system instructions is dispatched.

---

## 6. CLI Management & Observability

### Real-Time Quota Status
Inspect active consumption, sliding-window limits, cooldown countdowns, and Pacific reset timers:
```bash
cd worker
npm run quota:status
```

Sample Output:
```
========================================================================================
                          ZUKAI GEMINI MULTI-MODEL QUOTA STATUS                         
========================================================================================

Daily Quota Reset Window: Pacific Midnight (00:00 PST / 08:00 UTC)
Next Daily Reset:        2026-11-16T08:00:00.000Z (~15.2h remaining)
Active Task Pipelines:   outline (gemini-2.5-flash -> ...)
                         script  (gemini-3.5-flash-lite -> ...)
                         voice   (gemini-2.5-flash-preview-tts -> ...)
----------------------------------------------------------------------------------------

┌─────────┬────────────────────────────────┬──────────────┬────────────┬──────────┬─────────────┬────────────┬────────┐
│ (index) │ Model ID                       │ Kind         │ Status     │ RPM (1m) │ TPM (1m)    │ RPD (Day)  │ Active │
├─────────┼────────────────────────────────┼──────────────┼────────────┼──────────┼─────────────┼────────────┼────────┤
│ 0       │ 'gemini-2.5-flash'             │ 'text'       │ 'READY'    │ '0/5'    │ '0/250000'  │ '0/20'     │ 0      │
│ 4       │ 'gemini-3.5-flash-lite'        │ 'text'       │ 'READY'    │ '0/15'   │ '0/250000'  │ '0/500'    │ 0      │
│ 8       │ 'gemini-2.5-flash-preview-tts' │ 'tts'        │ 'READY'    │ '0/3'    │ '0/10000'   │ '0/10'     │ 0      │
│ 9       │ 'gemini-2.5-flash-live'        │ 'live-audio' │ 'READY'    │ '0/60'   │ '0/1000000' │ '0/10000'  │ 0      │
└─────────┴────────────────────────────────┴──────────────┴────────────┴──────────┴─────────────┴────────────┴────────┘
```

### Diagnostic Doctor Suite
Run end-to-end connectivity, credential, audio codec, and model fallback tests:
```bash
cd worker
npm run doctor
```
