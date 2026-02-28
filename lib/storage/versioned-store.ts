import Homey from 'homey';

export type StoreProvider = Pick<Homey.Device, 'getStoreValue' | 'setStoreValue' | 'unsetStoreValue'>;

/**
 * Internal storage format wrapping user data with version metadata.
 */
interface VersionedData<T> {
  version: number;
  data: T;
}

/**
 * Generic versioned storage with validation and error handling.
 * Provides graceful degradation - logs errors instead of throwing.
 */
export default class VersionedStore<T> {
  private readonly provider: StoreProvider;
  private readonly key: string;
  private readonly version: number;
  private readonly log: (message: string) => void;
  private readonly error: (message: string, err?: unknown) => void;

  constructor(
    provider: StoreProvider,
    key: string,
    version: number,
    log: (message: string) => void,
    error: (message: string, err?: unknown) => void,
  ) {
    this.provider = provider;
    this.key = key;
    this.version = version;
    this.log = log;
    this.error = error;
  }

  /**
   * Loads and validates stored data.
   * @returns The stored data, or null if no data, wrong version, or corrupted
   */
  load(): T | null {
    try {
      const stored = this.provider.getStoreValue(this.key) as VersionedData<T> | undefined;

      if (!stored) {
        return null;
      }

      if (typeof stored !== 'object' || stored.version !== this.version) {
        this.log(`Incompatible or corrupted stored data for '${this.key}' (version: ${stored?.version}, expected: ${this.version}), ignoring`);
        return null;
      }

      return stored.data;
    } catch (err) {
      this.error(`Failed to load data for '${this.key}'`, err);
      return null;
    }
  }

  /**
   * Saves data with version metadata.
   * Logs error on failure but doesn't throw.
   */
  async save(data: T): Promise<void> {
    try {
      const storeData: VersionedData<T> = {
        version: this.version,
        data,
      };
      await this.provider.setStoreValue(this.key, storeData);
    } catch (err) {
      this.error(`Failed to save data for '${this.key}'`, err);
    }
  }

  /**
   * Removes stored data.
   * Logs error on failure but doesn't throw.
   */
  async clear(): Promise<void> {
    try {
      await this.provider.unsetStoreValue(this.key);
    } catch (err) {
      this.error(`Failed to clear data for '${this.key}'`, err);
    }
  }
}
