/* eslint-disable node/no-unsupported-features/es-syntax */
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';

import { StoreProvider } from '../lib/storage';
import TimeoutStore from '../lib/storage/timeout-store';

describe('TimeoutStore', () => {
  let mockProvider: StoreProvider;
  let mockLog: (message: string) => void;
  let mockError: (message: string, err?: unknown) => void;
  let store: TimeoutStore;

  const STORE_KEY = 'learnedMotionTimeouts';
  const STORE_VERSION = 1;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      getStoreValue: vi.fn(),
      setStoreValue: vi.fn().mockResolvedValue(undefined),
      unsetStoreValue: vi.fn().mockResolvedValue(undefined),
    };

    mockLog = vi.fn();
    mockError = vi.fn();

    store = new TimeoutStore(mockProvider, mockLog, mockError);
  });

  describe('load()', () => {
    it('should return empty Map when no data stored', () => {
      vi.mocked(mockProvider.getStoreValue).mockReturnValue(undefined);

      const result = store.load();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should convert stored Record to Map with TimeoutLearningData format', () => {
      vi.mocked(mockProvider.getStoreValue).mockReturnValue({
        version: STORE_VERSION,
        data: {
          'device-1': 5000,
          'device-2': 10000,
        },
      });

      const result = store.load();

      expect(result.size).toBe(2);
      expect(result.get('device-1')).toEqual({
        lastTrueTimestamp: null,
        learnedTimeoutMs: 5000,
      });
      expect(result.get('device-2')).toEqual({
        lastTrueTimestamp: null,
        learnedTimeoutMs: 10000,
      });
    });

    it('should filter out non-positive timeout values', () => {
      vi.mocked(mockProvider.getStoreValue).mockReturnValue({
        version: STORE_VERSION,
        data: {
          'valid-device': 5000,
          'zero-timeout': 0,
          'negative-timeout': -1000,
        },
      });

      const result = store.load();

      expect(result.size).toBe(1);
      expect(result.has('valid-device')).toBe(true);
      expect(result.has('zero-timeout')).toBe(false);
      expect(result.has('negative-timeout')).toBe(false);
    });
  });

  describe('save()', () => {
    it('should save Map data with version wrapper', async () => {
      const data = new Map<string, number | null>([
        ['device-1', 5000],
        ['device-2', 10000],
      ]);

      await store.save(data);

      expect(mockProvider.setStoreValue).toHaveBeenCalledWith(STORE_KEY, {
        version: STORE_VERSION,
        data: {
          'device-1': 5000,
          'device-2': 10000,
        },
      });
    });

    it('should filter out null values when saving', async () => {
      const data = new Map<string, number | null>([
        ['device-1', 5000],
        ['device-2', null],
        ['device-3', 15000],
      ]);

      await store.save(data);

      expect(mockProvider.setStoreValue).toHaveBeenCalledWith(STORE_KEY, {
        version: STORE_VERSION,
        data: {
          'device-1': 5000,
          'device-3': 15000,
        },
      });
    });
  });

  describe('remove()', () => {
    it('should remove existing deviceId from storage', async () => {
      vi.mocked(mockProvider.getStoreValue).mockReturnValue({
        version: STORE_VERSION,
        data: {
          'device-1': 5000,
          'device-2': 10000,
        },
      });

      await store.remove('device-1');

      expect(mockProvider.setStoreValue).toHaveBeenCalledWith(STORE_KEY, {
        version: STORE_VERSION,
        data: {
          'device-2': 10000,
        },
      });
    });

    it('should handle removing non-existing deviceId gracefully', async () => {
      vi.mocked(mockProvider.getStoreValue).mockReturnValue({
        version: STORE_VERSION,
        data: {
          'device-1': 5000,
        },
      });

      await store.remove('non-existing-device');

      expect(mockProvider.setStoreValue).toHaveBeenCalledWith(STORE_KEY, {
        version: STORE_VERSION,
        data: {
          'device-1': 5000,
        },
      });
    });

    it('should handle remove when no stored data exists', async () => {
      vi.mocked(mockProvider.getStoreValue).mockReturnValue(undefined);

      await store.remove('any-device');

      expect(mockProvider.setStoreValue).toHaveBeenCalledWith(STORE_KEY, {
        version: STORE_VERSION,
        data: {},
      });
    });
  });

  describe('round-trip', () => {
    it('should preserve data through save and load cycle', async () => {
      const originalData = new Map<string, number | null>([
        ['device-1', 5000],
        ['device-2', 10000],
        ['device-3', 30000],
      ]);

      // Capture what gets saved
      let savedData: unknown;
      vi.mocked(mockProvider.setStoreValue).mockImplementation(async (key, value) => {
        savedData = value;
      });

      await store.save(originalData);

      // Return the saved data on load
      vi.mocked(mockProvider.getStoreValue).mockReturnValue(savedData);
      const loadedData = store.load();

      expect(loadedData.size).toBe(3);
      expect(loadedData.get('device-1')?.learnedTimeoutMs).toBe(5000);
      expect(loadedData.get('device-2')?.learnedTimeoutMs).toBe(10000);
      expect(loadedData.get('device-3')?.learnedTimeoutMs).toBe(30000);
    });
  });
});
