/* eslint-disable node/no-unsupported-features/es-syntax */
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';

import { StoreProvider } from '../lib/storage';
import VersionedStore from '../lib/storage/versioned-store';

describe('VersionedStore', () => {
  let mockProvider: StoreProvider;
  let mockLog: (message: string) => void;
  let mockError: (message: string, err?: unknown) => void;
  let store: VersionedStore<{ value: number }>;

  const TEST_KEY = 'test-data';
  const TEST_VERSION = 1;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      getStoreValue: vi.fn(),
      setStoreValue: vi.fn().mockResolvedValue(undefined),
      unsetStoreValue: vi.fn().mockResolvedValue(undefined),
    };

    mockLog = vi.fn();
    mockError = vi.fn();

    store = new VersionedStore<{ value: number }>(
      mockProvider,
      TEST_KEY,
      TEST_VERSION,
      mockLog,
      mockError,
    );
  });

  describe('load()', () => {
    it('should return null when no data stored', () => {
      vi.mocked(mockProvider.getStoreValue).mockReturnValue(undefined);

      const result = store.load();

      expect(result).toBeNull();
      expect(mockProvider.getStoreValue).toHaveBeenCalledWith(TEST_KEY);
    });

    it('should return data when valid data with correct version stored', () => {
      const testData = { value: 42 };
      vi.mocked(mockProvider.getStoreValue).mockReturnValue({
        version: TEST_VERSION,
        data: testData,
      });

      const result = store.load();

      expect(result).toEqual(testData);
    });

    it('should return null and log when version mismatch', () => {
      vi.mocked(mockProvider.getStoreValue).mockReturnValue({
        version: 999,
        data: { value: 42 },
      });

      const result = store.load();

      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Incompatible or corrupted'),
      );
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('version: 999'),
      );
    });

    it('should return null and log when data is corrupted/invalid structure', () => {
      // Corrupted data: not an object with version/data structure
      vi.mocked(mockProvider.getStoreValue).mockReturnValue('invalid-string');

      const result = store.load();

      expect(result).toBeNull();
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Incompatible or corrupted'),
      );
    });

    it('should return null and log error when getStoreValue throws', () => {
      const testError = new Error('Storage read failed');
      vi.mocked(mockProvider.getStoreValue).mockImplementation(() => {
        throw testError;
      });

      const result = store.load();

      expect(result).toBeNull();
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load'),
        testError,
      );
    });
  });

  describe('save()', () => {
    it('should save data wrapped with version metadata', async () => {
      const testData = { value: 123 };

      await store.save(testData);

      expect(mockProvider.setStoreValue).toHaveBeenCalledWith(TEST_KEY, {
        version: TEST_VERSION,
        data: testData,
      });
    });

    it('should log error but not throw when setStoreValue fails', async () => {
      const testError = new Error('Storage write failed');
      vi.mocked(mockProvider.setStoreValue).mockRejectedValue(testError);

      // Should not throw
      await expect(store.save({ value: 1 })).resolves.toBeUndefined();

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save'),
        testError,
      );
    });
  });

  describe('clear()', () => {
    it('should call unsetStoreValue with correct key', async () => {
      await store.clear();

      expect(mockProvider.unsetStoreValue).toHaveBeenCalledWith(TEST_KEY);
    });

    it('should log error but not throw when unsetStoreValue fails', async () => {
      const testError = new Error('Storage delete failed');
      vi.mocked(mockProvider.unsetStoreValue).mockRejectedValue(testError);

      // Should not throw
      await expect(store.clear()).resolves.toBeUndefined();

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear'),
        testError,
      );
    });
  });
});
