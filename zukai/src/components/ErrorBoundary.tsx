/**
 * ZUKAI ROOT ERROR BOUNDARY
 * Location: /zukai/src/components/ErrorBoundary.tsx
 * Catches unhandled React render errors and presents a branded recovery view.
 */

import React, { Component, type ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { Text } from './Text';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const C = {
  brandHero: '#8EF20F',
  canvasSurface: '#0D1E24',
  canvasSurfaceRaised: '#132830',
  textPrimary: '#F4F7F2',
  textSecondary: '#B5C4CC',
  textInverse: '#09161B',
  error: '#FF5252',
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log error to console / diagnostics buffer
    console.error('[ErrorBoundary caught]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <AlertTriangle size={32} color={C.error} strokeWidth={2} />
            </View>

            <Text variant="title1" rawColor={C.textPrimary} style={styles.title}>
              Something went wrong
            </Text>

            <Text variant="body" rawColor={C.textSecondary} style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred in the application.'}
            </Text>

            <Pressable style={styles.retryButton} onPress={this.handleReset}>
              <RefreshCw size={16} color={C.textInverse} strokeWidth={2.5} style={{ marginRight: 8 }} />
              <Text variant="subhead" rawColor={C.textInverse} style={{ fontWeight: '700' }}>
                RELOAD VIEW
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.canvasSurface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: C.canvasSurfaceRaised,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.brandHero,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
});
