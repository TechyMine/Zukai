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
  | 'graduation'
  | 'graduation_cap'
  | 'flame'
  | 'hourglass'
  | 'coffee'
  | 'coffee_break'
  | 'sleeping'
  | 'confused'
  | 'download'
  | 'clock'
  | 'star'
  | 'wrench'
  | 'crown'
  | 'pointing'
  | 'pointing_left'
  | 'pointing_right'
  | 'hero_float'
  | 'jetpack'
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
  base: require('./wave.png'),
  wave: require('./wave.png'),
  reading: require('./reading.png'),
  headphones: require('./headphones.png'),
  lightbulb: require('./lightbulb.png'),
  typing: require('./typing.png'),
  carrying_document: require('./carrying_document.png'),
  trophy: require('./trophy.png'),
  graduation: require('./graduation.png'),
  graduation_cap: require('./graduation.png'),
  flame: require('./flame.png'),
  hourglass: require('./hourglass.png'),
  coffee: require('./coffee.png'),
  coffee_break: require('./coffee.png'),
  sleeping: require('./sleeping.png'),
  confused: require('./confused.png'),
  download: require('./carrying_document.png'),
  clock: require('./hourglass.png'),
  star: require('./trophy.png'),
  wrench: require('./typing.png'),
  crown: require('./crown.png'),
  pointing: require('./pointing.png'),
  pointing_right: require('./pointing.png'),
  pointing_left: require('./pointing_left.png'),
  hero_float: require('./wave.png'),
  jetpack: require('./flame.png'),
  thumbs_up: require('./thumbs_up.png'),

  // Aliases
  welcome: require('./wave.png'),
  uploading: require('./carrying_document.png'),
  thinking: require('./confused.png'),
  listening: require('./headphones.png'),
  success: require('./thumbs_up.png'),
  error: require('./confused.png'),
  empty: require('./reading.png'),
  paywall: require('./crown.png'),
  offline: require('./sleeping.png'),
};
