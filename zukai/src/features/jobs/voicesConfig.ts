/**
 * ZUKAI VOICE CONFIGURATION
 * Location: /zukai/src/features/jobs/voicesConfig.ts
 * Description: Real Google Gemini voice presets mapped directly to TTS & Live API
 */

export interface VoiceOption {
  id: string;
  name: string;
  role: string;
  tone: string;
  geminiVoiceName: string;
  description: string;
}

export const VOICES: VoiceOption[] = [
  {
    id: 'puck',
    name: 'Puck',
    role: 'Lead Mentor',
    tone: 'Engaging & Dynamic',
    geminiVoiceName: 'Puck',
    description: 'Energetic, modern, and exceptionally clear for all topics.',
  },
  {
    id: 'charon',
    name: 'Charon',
    role: 'Executive Analyst',
    tone: 'Deep & Authoritative',
    geminiVoiceName: 'Charon',
    description: 'Deep, deliberate cadence ideal for whitepapers & deep briefs.',
  },
  {
    id: 'kore',
    name: 'Kore',
    role: 'Academic Tutor',
    tone: 'Calm & Thoughtful',
    geminiVoiceName: 'Kore',
    description: 'Approachable, warm pacing that makes complex guides easy to follow.',
  },
  {
    id: 'fenrir',
    name: 'Fenrir',
    role: 'Energetic Coach',
    tone: 'Warm & Crisp',
    geminiVoiceName: 'Fenrir',
    description: 'Focused, clear, and inspiring delivery for fast learning.',
  },
];

export const DEFAULT_VOICE_ID = 'puck';
