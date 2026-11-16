# Zukai Android Permissions Audit

This document details all Android runtime and manifest permissions used by the Zukai client.

## Declared Permissions

| Permission | Category | Purpose | User Disclosure |
|---|---|---|---|
| `POST_NOTIFICATIONS` | Runtime (API 33+) | Notifies the user when an audio explanation finishes synthesizing in the background, and displays background playback media controls. | Prompted during first audio play via `AllowAudioSheet` and toggleable in Settings. |
| `INTERNET` | Normal | Required for communicating with Supabase backend and streaming audio tracks. | Granted automatically at install time. |
| `ACCESS_NETWORK_STATE` | Normal | Monitored by `NetInfo` to auto-pause/resume resumable TUS uploads when connectivity changes. | Granted automatically at install time. |
| `FOREGROUND_SERVICE` | Normal | Maintains uninterrupted audio playback when the app is minimized. | Managed by `expo-av` background audio mode. |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Normal (API 34+) | Specific foreground service type for media and audio streaming. | Declared by `expo-av`. |

## Explicitly Excluded / Forbidden Permissions
- `RECORD_AUDIO`: **Not included**. Zukai is an audio *playback* and document conversion service; it does not record user microphone audio.
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`: **Not included**. Document picking utilizes Android Storage Access Framework (`expo-document-picker`), and audio downloads are cached strictly in app-private storage (`FileSystem.documentDirectory`).
- Any fake or misleading "speaker permission" prompts have been eliminated in favor of honest media control and notification disclosure (`AllowAudioSheet.tsx`).
