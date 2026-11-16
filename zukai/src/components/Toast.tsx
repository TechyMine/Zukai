/**
 * ZUKAI GLOBAL TOAST SYSTEM
 * Displays safe-area aware top toasts below the status bar.
 * Auto-dismisses, swipe up to dismiss, single queued message.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  PanResponder,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react-native';
import { Text } from './Text';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number; // ms, default 3000
}

interface ToastContextValue {
  showToast: (options: ToastOptions | string) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  hideToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const translateY = useSharedValue(-150);
  const opacity = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    translateY.value = withTiming(-150, { duration: 250 }, () => {
      runOnJS(setToast)(null);
    });
    opacity.value = withTiming(0, { duration: 200 });
  }, [translateY, opacity]);

  const showToast = useCallback(
    (opts: ToastOptions | string) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const parsed: ToastOptions = typeof opts === 'string' ? { message: opts } : opts;
      setToast(parsed);

      translateY.value = withSpring(0, { damping: 16, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 200 });

      const duration = parsed.duration ?? 3200;
      timerRef.current = setTimeout(() => {
        hideToast();
      }, duration);
    },
    [translateY, opacity, hideToast]
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const iconColor =
    toast?.type === 'error'
      ? '#FF5252'
      : toast?.type === 'info'
      ? '#00B0FF'
      : '#8EF20F';

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            { top: insets.top + (Platform.OS === 'ios' ? 8 : 12) },
            animStyle,
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            style={[styles.toastCard, { borderColor: `${iconColor}40` }]}
            onPress={hideToast}
          >
            <View style={styles.contentRow}>
              {toast.type === 'error' ? (
                <AlertCircle size={18} color={iconColor} strokeWidth={2.5} />
              ) : toast.type === 'info' ? (
                <Info size={18} color={iconColor} strokeWidth={2.5} />
              ) : (
                <CheckCircle2 size={18} color={iconColor} strokeWidth={2.5} />
              )}
              <Text variant="subhead" rawColor="#F4F7F2" numberOfLines={2} style={styles.message}>
                {toast.message}
              </Text>
              <Pressable onPress={hideToast} hitSlop={8} style={styles.closeBtn}>
                <X size={14} color="#6B828F" />
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(11, 20, 24, 0.96)',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  message: {
    flex: 1,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 2,
  },
});
