import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { HeroCard } from '../src/components/HeroCard';
import { RoundArrowButton } from '../src/components/RoundArrowButton';
import { HaloPlayButton } from '../src/components/HaloPlayButton';
import { ThemeProvider } from '../src/theme/ThemeProvider';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_, name) => (props: any) =>
        React.createElement(View, { testID: `lucide-${String(name)}`, ...props }),
    }
  );
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return {
    Image: (props: any) => React.createElement(View, { testID: 'expo-image', ...props }),
  };
});

describe('Phase UI-V2 Components', () => {
  it('renders HeroCard with lime variant and children', async () => {
    const screen = await render(
      <ThemeProvider>
        <HeroCard variant="lime" mascot="wave">
          <Text>Turn any document into audio</Text>
        </HeroCard>
      </ThemeProvider>
    );

    expect(screen.getByText('Turn any document into audio')).toBeTruthy();
  });

  it('renders HeroCard with forest variant and fires onPress', async () => {
    const onPressMock = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <HeroCard variant="forest" mascot="headphones" onPress={onPressMock}>
          <Text>Continue listening</Text>
        </HeroCard>
      </ThemeProvider>
    );

    fireEvent.press(screen.getByText('Continue listening'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('renders RoundArrowButton and triggers onPress', async () => {
    const onPressMock = jest.fn();
    const screen = await render(
      <RoundArrowButton variant="dark-glossy" accessibilityLabel="Open" onPress={onPressMock} />
    );

    fireEvent.press(screen.getByLabelText('Open'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('renders HaloPlayButton with play state and triggers onPress', async () => {
    const onPressMock = jest.fn();
    const screen = await render(
      <HaloPlayButton isPlaying={false} accessibilityLabel="Play" onPress={onPressMock} />
    );

    fireEvent.press(screen.getByLabelText('Play'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});
