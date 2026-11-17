/**
 * ZUKAI DESIGN SYSTEM - RADIUS TOKENS
 * Continuous-corner squircle aesthetic inspired by Apple iOS design.
 */

export const radius = {
  none: 0,
  xs: 4,      // Micro tags, sub-indicators
  sm: 8,      // Badges, small pills, chip filters
  md: 12,     // Compact inputs, list item containers
  lg: 16,     // Primary buttons, text inputs
  xl: 20,     // Standard glass cards, audio player cover, tiles (Phase UI-V2)
  '2xl': 24,  // Big cards, bottom sheets, hero floating cards (Phase UI-V2)
  '3xl': 32,  // Large modal dialogs, player carousel
  full: 9999, // Pill buttons, circular icons, progress rings (Phase UI-V2)

  // Phase UI-V2 Semantic aliases
  bigCard: 24,
  card: 24,
  tile: 20,
  pill: 999,
} as const;

export type Radius = typeof radius;

