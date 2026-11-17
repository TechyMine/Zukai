/**
 * ZUKAI NETWORK STATE HOOK
 * Location: /zukai/src/hooks/useNetworkState.ts
 * Periodically monitors internet connectivity and provides reactive online status.
 */

import { useState, useEffect, useRef } from 'react';

export function useNetworkState() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkConnectivity() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        // Fast endpoint check
        const response = await fetch('https://www.gstatic.com/generate_204', {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeoutId);

        if (isMounted) {
          setIsOnline(response.ok || response.status === 204);
        }
      } catch {
        if (isMounted) {
          setIsOnline(false);
        }
      }
    }

    checkConnectivity();
    intervalRef.current = setInterval(checkConnectivity, 15000);

    return () => {
      isMounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { isOnline };
}
