/**
 * ZUKAI DESIGN SYSTEM - GRADIENT RECIPES
 * Configured as structured objects directly consumable by expo-linear-gradient
 * and custom canvas/radial mesh backgrounds in React Native & Web.
 */

export interface LinearGradientRecipe {
  colors: readonly string[];
  locations?: readonly number[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface RadialGlow {
  color: string;
  cx: string; // e.g. '80%', '20%'
  cy: string; // e.g. '15%', '85%'
  radius: number | string; // e.g. 350, '400px'
  opacity: number;
}

export interface BackgroundMeshRecipe {
  baseColor: string;
  glows: readonly RadialGlow[];
}

export const gradients = {
  // -------------------------------------------------------------
  // 1. BUTTON GRADIENTS (with gloss reflection)
  // -------------------------------------------------------------
  button: {
    // Phase UI-V2 Spec: #C6FF5C -> #8EF20F -> #62DB0B
    primary: {
      colors: ['#C6FF5C', '#8EF20F', '#62DB0B'],
      locations: [0, 0.5, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    } as LinearGradientRecipe,

    primaryHover: {
      colors: ['#D1FB97', '#A4F924', '#75CE00'],
      locations: [0, 0.5, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    } as LinearGradientRecipe,

    primaryPressed: {
      colors: ['#8EF20F', '#62DB0B', '#55D80B'],
      locations: [0, 0.5, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    } as LinearGradientRecipe,

    // Phase UI-V2 Dark Glossy Button (for use on Lime cards): #1A242B -> #0B1418
    darkGlossy: {
      colors: ['#1A242B', '#0B1418'],
      locations: [0, 1],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    } as LinearGradientRecipe,

    // Phase UI-V2 Glass Button: rgba white 8% to 4%
    glass: {
      colors: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)'],
      locations: [0, 1],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    } as LinearGradientRecipe,

    // Upper 45% gloss highlight overlay
    shineOverlay: {
      colors: ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)'],
      locations: [0, 1],
      start: { x: 0.5, y: 0 },
      end: { x: 0.5, y: 1 },
    } as LinearGradientRecipe,

    secondaryGlass: {
      colors: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)'],
      locations: [0, 1],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    } as LinearGradientRecipe,

    destructive: {
      colors: ['#FF5E8A', '#FF3D71', '#D41E52'],
      locations: [0, 0.5, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    } as LinearGradientRecipe,
  },

  // -------------------------------------------------------------
  // 2. CARD & ELEMENT GRADIENTS (Phase UI-V2)
  // -------------------------------------------------------------
  card: {
    // Lime Card Gradient (160 deg: #E4FFA3 -> #B6F94A -> #8EF20F -> #55D80B)
    lime: {
      colors: ['#E4FFA3', '#B6F94A', '#8EF20F', '#55D80B'],
      locations: [0, 0.35, 0.70, 1],
      start: { x: 0.15, y: 0 },
      end: { x: 0.85, y: 1 },
    } as LinearGradientRecipe,

    // Forest Card Gradient (deep green #0F2A12 to #0B1418 with lime glow)
    forest: {
      colors: ['#0F2A12', '#0B1418'],
      locations: [0, 1],
      start: { x: 0, y: 0 },
      end: { x: 0.6, y: 1 },
    } as LinearGradientRecipe,

    // Dark Card Surface (#12191E to #0E1418)
    darkSurface: {
      colors: ['#12191E', '#0E1418'],
      locations: [0, 1],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    } as LinearGradientRecipe,

    surface: {
      colors: ['#12191E', '#0E1418'],
      locations: [0, 1],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    } as LinearGradientRecipe,

    highlightBorder: {
      colors: ['rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.05)', 'rgba(142, 242, 15, 0.30)'],
      locations: [0, 0.6, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    } as LinearGradientRecipe,

    progressRing: {
      colors: ['#8EF20F', '#0BF807', '#00B0FF'],
      locations: [0, 0.6, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    } as LinearGradientRecipe,
  },

  // -------------------------------------------------------------
  // 3. BACKGROUND MESH RECIPES FOR ALL SCREENS
  // -------------------------------------------------------------
  screenMesh: {
    splash: {
      baseColor: '#050D10',
      glows: [
        { color: '#92F702', cx: '50%', cy: '45%', radius: 320, opacity: 0.22 },
        { color: '#0BF807', cx: '50%', cy: '55%', radius: 420, opacity: 0.15 },
        { color: '#00B0FF', cx: '50%', cy: '85%', radius: 250, opacity: 0.08 },
      ],
    } as BackgroundMeshRecipe,

    onboarding: {
      baseColor: '#09161B',
      glows: [
        { color: '#92F702', cx: '85%', cy: '15%', radius: 360, opacity: 0.18 },
        { color: '#0BF807', cx: '15%', cy: '60%', radius: 320, opacity: 0.14 },
        { color: '#132830', cx: '50%', cy: '90%', radius: 400, opacity: 0.40 },
      ],
    } as BackgroundMeshRecipe,

    home: {
      baseColor: '#09161B',
      glows: [
        { color: '#92F702', cx: '85%', cy: '12%', radius: 340, opacity: 0.16 },
        { color: '#0BF807', cx: '10%', cy: '40%', radius: 300, opacity: 0.10 },
        { color: '#00E676', cx: '90%', cy: '80%', radius: 320, opacity: 0.08 },
      ],
    } as BackgroundMeshRecipe,

    upload: {
      baseColor: '#09161B',
      glows: [
        { color: '#92F702', cx: '50%', cy: '25%', radius: 380, opacity: 0.18 },
        { color: '#0BF807', cx: '20%', cy: '75%', radius: 340, opacity: 0.12 },
        { color: '#00B0FF', cx: '80%', cy: '85%', radius: 280, opacity: 0.10 },
      ],
    } as BackgroundMeshRecipe,

    processing: {
      baseColor: '#071216',
      glows: [
        { color: '#92F702', cx: '50%', cy: '40%', radius: 420, opacity: 0.24 },
        { color: '#0BF807', cx: '50%', cy: '50%', radius: 300, opacity: 0.20 },
        { color: '#00E676', cx: '20%', cy: '80%', radius: 360, opacity: 0.12 },
      ],
    } as BackgroundMeshRecipe,

    player: {
      baseColor: '#050D10',
      glows: [
        { color: '#92F702', cx: '50%', cy: '30%', radius: 400, opacity: 0.22 },
        { color: '#0BF807', cx: '80%', cy: '60%', radius: 350, opacity: 0.15 },
        { color: '#09161B', cx: '20%', cy: '85%', radius: 450, opacity: 0.50 },
      ],
    } as BackgroundMeshRecipe,

    library: {
      baseColor: '#09161B',
      glows: [
        { color: '#92F702', cx: '15%', cy: '15%', radius: 300, opacity: 0.12 },
        { color: '#0BF807', cx: '90%', cy: '50%', radius: 320, opacity: 0.09 },
        { color: '#132830', cx: '50%', cy: '90%', radius: 380, opacity: 0.35 },
      ],
    } as BackgroundMeshRecipe,

    paywall: {
      baseColor: '#050D10',
      glows: [
        { color: '#92F702', cx: '50%', cy: '20%', radius: 420, opacity: 0.28 },
        { color: '#FFD600', cx: '85%', cy: '45%', radius: 320, opacity: 0.15 },
        { color: '#0BF807', cx: '15%', cy: '75%', radius: 350, opacity: 0.18 },
      ],
    } as BackgroundMeshRecipe,

    settings: {
      baseColor: '#09161B',
      glows: [
        { color: '#92F702', cx: '80%', cy: '15%', radius: 280, opacity: 0.10 },
        { color: '#0BF807', cx: '15%', cy: '70%', radius: 300, opacity: 0.08 },
      ],
    } as BackgroundMeshRecipe,
  },
} as const;

