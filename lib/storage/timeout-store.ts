import { TimeoutLearningData } from '../sensors/motion-sensor-registry';
import VersionedStore, { StoreProvider } from './versioned-store';

const STORE_KEY = 'learnedMotionTimeouts';
const STORE_VERSION = 1;

/**
 * Adapter for storing learned motion sensor timeout data.
 * Wraps VersionedStore with timeout-specific operations.
 */
export default class TimeoutStore {
  private readonly store: VersionedStore<Record<string, number>>;

  constructor(
    provider: StoreProvider,
    log: (message: string) => void,
    error: (message: string, err?: unknown) => void,
  ) {
    this.store = new VersionedStore(provider, STORE_KEY, STORE_VERSION, log, error);
  }

  /**
   * Loads stored timeout data and converts to TimeoutLearningData format.
   * @returns Map of device IDs to their timeout learning data, or empty Map if no data
   */
  load(): Map<string, TimeoutLearningData> {
    const stored = this.store.load();
    const result = new Map<string, TimeoutLearningData>();

    if (!stored) {
      return result;
    }

    for (const [deviceId, timeoutMs] of Object.entries(stored)) {
      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        result.set(deviceId, {
          lastTrueTimestamp: null,
          learnedTimeoutMs: timeoutMs,
        });
      }
    }

    return result;
  }

  /**
   * Saves timeout data from Map format to storage.
   * Filters out null timeout values.
   */
  async save(data: Map<string, number | null>): Promise<void> {
    const timeouts: Record<string, number> = {};

    for (const [deviceId, timeoutMs] of data) {
      if (timeoutMs !== null) {
        timeouts[deviceId] = timeoutMs;
      }
    }

    await this.store.save(timeouts);
  }

  /**
   * Removes a single device's timeout data.
   * Uses load-modify-save cycle.
   */
  async remove(deviceId: string): Promise<void> {
    const stored = this.store.load() ?? {};
    delete stored[deviceId];
    await this.store.save(stored);
  }
}
