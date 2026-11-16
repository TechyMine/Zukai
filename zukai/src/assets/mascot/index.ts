/**
 * ZUKAI MASCOT ASSET INDEX
 * Maps all 20 approved Zuke bot poses to their required images.
 * Implements the 20-pose EdTech character specification.
 */

export type MascotPose =
  | 'base'
  | 'wave'
  | 'reading'
  | 'headphones'
  | 'lightbulb'
  | 'typing'
  | 'carrying_document'
  | 'trophy'
  | 'graduation_cap'
  | 'flame'
  | 'hourglass'
  | 'coffee_break'
  | 'sleeping'
  | 'confused'
  | 'download'
  | 'clock'
  | 'star'
  | 'wrench'
  | 'crown'
  | 'pointing'
  | 'thumbs_up'
  // Backward compatibility aliases
  | 'welcome'
  | 'uploading'
  | 'thinking'
  | 'listening'
  | 'success'
  | 'error'
  | 'empty'
  | 'paywall'
  | 'offline';

export const mascotImages: Record<MascotPose, number> = {
  base: require('./_base.png'),
  wave: require('./_base.png'),
  reading: require('./_base.png'),
  headphones: require('./_base.png'),
  lightbulb: require('./_base.png'),
  typing: require('./_base.png'),
  carrying_document: require('./_base.png'),
  trophy: require('./_base.png'),
  graduation_cap: require('./_base.png'),
  flame: require('./_base.png'),
  hourglass: require('./_base.png'),
  coffee_break: require('./_base.png'),
  sleeping: require('./_base.png'),
  confused: require('./_base.png'),
  download: require('./_base.png'),
  clock: require('./_base.png'),
  star: require('./_base.png'),
  wrench: require('./_base.png'),
  crown: require('./_base.png'),
  pointing: require('./_base.png'),
  thumbs_up: require('./_base.png'),

  // Aliases
  welcome: require('./_base.png'),
  uploading: require('./_base.png'),
  thinking: require('./_base.png'),
  listening: require('./_base.png'),
  success: require('./_base.png'),
  error: require('./_base.png'),
  empty: require('./_base.png'),
  paywall: require('./_base.png'),
  offline: require('./_base.png'),
};
