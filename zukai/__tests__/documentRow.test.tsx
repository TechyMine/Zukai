/**
 * ZUKAI DOCUMENT ROW REGRESSION TESTS
 * Verifies that DocumentRow renders short and long titles without text collapse,
 * displays all status and language chips, and triggers callbacks.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DocumentRow } from '../src/components/DocumentRow';

// Mock ThemeProvider
jest.mock('../src/theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      glass: {
        borderActive: 'rgba(142, 242, 15, 0.45)',
      },
      text: {
        primary: '#F4F7F2',
        secondary: '#B5C4CC',
        tertiary: '#6B828F',
      },
    },
    typography: {
      headline: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
      caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
      subhead: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
      title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
      title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
      title3: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
      footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
    },
    radius: { xl: 16 },
  }),
}));

// Mock lucide-react-native
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

// Mock expo-blur
jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

describe('DocumentRow Component', () => {
  test('renders standard document title and metadata line correctly', async () => {
    const screen = await render(
      <DocumentRow
        title="Physics Chapter 4 Notes"
        originalFilename="physics_ch4.pdf"
        fileSizeBytes={1024 * 1024 * 2.5}
        durationSeconds={345}
        createdAt="2026-11-15T12:00:00Z"
        status="ready"
        language="english"
        depth="standard"
      />
    );

    expect(screen.getByText('Physics Chapter 4 Notes')).toBeTruthy();
    expect(screen.getByText('READY')).toBeTruthy();
    expect(screen.getByText('EN')).toBeTruthy();
    expect(screen.getByText('STANDARD')).toBeTruthy();
    expect(screen.getByText(/2.5 MB/)).toBeTruthy();
  });

  test('renders extremely long titles without throwing or truncating to empty string', async () => {
    const longTitle = 'A'.repeat(250) + ' Super Long Engineering Thesis on Quantum Electrodynamics';
    const screen = await render(
      <DocumentRow
        title={longTitle}
        originalFilename="thesis.docx"
        fileSizeBytes={1024 * 512}
        status="waiting_for_capacity"
        language="hinglish"
        depth="deep"
      />
    );

    const titleNode = screen.getByText(longTitle);
    expect(titleNode).toBeTruthy();
    expect(screen.getByText('PAUSED')).toBeTruthy();
    expect(screen.getByText('HINGLISH')).toBeTruthy();
    expect(screen.getByText('DEEP')).toBeTruthy();
  });

  test('handles status chip variants (queued, failed, processing)', async () => {
    const screen = await render(
      <DocumentRow
        title="Doc 1"
        status="queued"
      />
    );
    expect(screen.getByText('QUEUED')).toBeTruthy();

    await screen.rerender(
      <DocumentRow
        title="Doc 1"
        status="failed"
      />
    );
    expect(screen.getByText('FAILED')).toBeTruthy();

    await screen.rerender(
      <DocumentRow
        title="Doc 1"
        status="voicing"
      />
    );
    expect(screen.getByText('PROCESSING')).toBeTruthy();
  });

  test('triggers row onPress, onToggleFavorite, and onMenuPress', async () => {
    const onPress = jest.fn();
    const onToggleFavorite = jest.fn();
    const onMenuPress = jest.fn();

    const screen = await render(
      <DocumentRow
        title="Calculus Cheat Sheet"
        status="ready"
        onPress={onPress}
        onToggleFavorite={onToggleFavorite}
        onMenuPress={onMenuPress}
      />
    );

    fireEvent.press(screen.getByLabelText('Document Calculus Cheat Sheet'));
    expect(onPress).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Favorite'));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Document options'));
    expect(onMenuPress).toHaveBeenCalledTimes(1);
  });
});
