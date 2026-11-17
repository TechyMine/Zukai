/**
 * ZUKAI DESIGN SYSTEM - COLOR TOKENS
 * Sampled directly from Zukai Brand Identity (logo.png, logo-with-name.png)
 * Strictly tuned for high-contrast, premium dark mode and WCAG AA/AAA compliance.
 */

export const colors = {
  // Brand Neon & Volt Green Scale (50 to 900)
  brand: {
    50: '#F4FEE7',
    100: '#E6FDC7',
    200: '#D1FB97',
    300: '#B8F95F',
    400: '#A4F924',  // Light hover green
    500: '#8EF20F',  // HERO NEON LIME GREEN (#8EF20F Phase UI-V2)
    600: '#75CE00',  // Mid-tone active green
    700: '#55D80B',  // Deep accent green
    800: '#427A00',  // Dark green container border
    900: '#2C5300',  // Deepest green shade
    // Key Accents & Phase UI-V2 Tokens
    hero: '#8EF20F',
    visor: '#0BF807',       // Vivid Emerald (visor center glow)
    deep: '#55D80B',        // Deep button bevel / shadow
    darkContainer: '#0F2A12',// Forest green card base (#0F2A12)
    highlightLight: '#E4FFA3', // Lime gradient start
    highlightMid: '#B6F94A',   // Lime gradient mid
    buttonLimeLight: '#C6FF5C',// Shiny button lime start
    buttonLimeMid: '#8EF20F',  // Shiny button lime mid
    buttonLimeDark: '#62DB0B', // Shiny button lime end
    forestBase: '#0F2A12',     // Forest gradient start
  },

  // Dark Canvas & Background Scale (Phase UI-V2: near-black #0B1418)
  canvas: {
    abyss: '#050D10',        // Deepest cold black (Player & Splash base)
    base: '#0B1418',         // Base near-black canvas (#0B1418)
    surface: '#12191E',      // Dark card surface start (#12191E)
    surfaceRaised: '#0E1418',// Dark card surface end / elevated cards (#0E1418)
    surfaceHighlight: '#1A242B', // Dark glossy button start
    overlay: 'rgba(11, 20, 24, 0.85)', // Modal backdrops
  },

  // Typography & Content Hierarchy
  text: {
    primary: '#F4F7F2',      // High-contrast off-white (#F4F7F2 Phase UI-V2)
    secondary: '#B5C4CC',    // Muted body, subtitles
    tertiary: '#6B828F',     // Metadata, timestamps, inactive icons
    disabled: '#3A4B54',     // Inactive actions, placeholder text
    inverse: '#0B1418',      // Dark text on bright Neon Lime CTA buttons
    dark: '#0B1418',         // Dark text for Lime Hero Cards (Contrast AA)
    accent: '#8EF20F',       // Highlighted keywords, links, active state
  },

  // Semantic Status Tones (Tuned specifically for dark UI)
  semantic: {
    success: '#00E676',      // Vibrantly clear green for completed audio
    successMuted: 'rgba(0, 230, 118, 0.16)',
    warning: '#FFD600',      // Crisp golden yellow for quota warnings
    warningMuted: 'rgba(255, 214, 0, 0.16)',
    error: '#FF3D71',        // Electric coral red for parsing/upload failures
    errorMuted: 'rgba(255, 61, 113, 0.16)',
    info: '#00B0FF',         // Cyan blue for informational status/processing
    infoMuted: 'rgba(0, 176, 255, 0.16)',
  },

  // Glassmorphic Fills, Strokes & Glows
  glass: {
    surfaceSubtle: 'rgba(255, 255, 255, 0.04)',
    surfaceLight: 'rgba(255, 255, 255, 0.08)',
    surfaceCard: 'rgba(18, 25, 30, 0.70)',       // Primary frosted card fill (#12191E)
    surfaceRaised: 'rgba(26, 36, 43, 0.82)',     // Modal / Sheet fill
    surfaceShine: 'rgba(255, 255, 255, 0.28)',    // Button upper gloss highlight
    borderSubtle: 'rgba(255, 255, 255, 0.08)',   // Standard dark card border
    borderLight: 'rgba(255, 255, 255, 0.14)',    // Standard glass card border
    borderHighlight: 'rgba(255, 255, 255, 0.35)',// Top-rim reflection stroke
    borderActive: 'rgba(142, 242, 15, 0.45)',    // Focused input & active card border
    glowGreen: 'rgba(142, 242, 15, 0.35)',       // Primary button & player aura (Phase UI-V2)
    glowVisor: 'rgba(11, 248, 7, 0.22)',         // Ambient audio visualizer glow
  },
} as const;

export type Colors = typeof colors;

