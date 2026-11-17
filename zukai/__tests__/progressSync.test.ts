/**
 * Test: Playback Progress Sync & Throttling
 * Location: /zukai/__tests__/progressSync.test.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrCreateDeviceId, _resetCachedDeviceIdForTesting } from '../src/features/playback/progressSync';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../src/features/playback/api/playbackApi', () => ({
  updatePlaybackProgress: jest.fn().mockResolvedValue({}),
  addListeningSeconds: jest.fn().mockResolvedValue(undefined),
}));

describe('Playback Progress Sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetCachedDeviceIdForTesting();
  });

  it('generates and stores a persistent device ID if none exists', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const deviceId = await getOrCreateDeviceId();
    expect(deviceId).toBeTruthy();
    expect(deviceId.startsWith('dev_')).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.stringContaining('device_id'),
      deviceId
    );
  });

  it('reuses existing device ID from AsyncStorage when present', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('dev_cached_12345');

    const deviceId = await getOrCreateDeviceId();
    expect(deviceId).toBe('dev_cached_12345');
  });
});
