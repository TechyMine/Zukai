const React = require('react');

const MockComponent = ({ children, ...props }) => React.createElement('View', props, children);

const Animated = {
  View: MockComponent,
  Text: ({ children, ...props }) => React.createElement('Text', props, children),
  ScrollView: ({ children, ...props }) => React.createElement('ScrollView', props, children),
  createAnimatedComponent: (c) => c,
};

module.exports = {
  __esModule: true,
  default: Animated,
  Animated,
  useSharedValue: (init) => ({ value: init }),
  useAnimatedStyle: (fn) => fn ? fn() : {},
  withSpring: (toVal) => toVal,
  withTiming: (toVal) => toVal,
  withRepeat: (anim) => anim,
  withSequence: (...anims) => anims[0],
  withDelay: (_, anim) => anim,
  cancelAnimation: () => {},
  Easing: {
    inOut: (f) => f,
    sin: (t) => t,
    ease: (t) => t,
  },
  runOnJS: (fn) => fn,
  interpolate: () => 0,
  Extrapolation: { CLAMP: 'clamp' },
};
