/* eslint-disable import/prefer-default-export */
import { HomeyInstance } from 'homey-api';
import { DeviceEvent } from './sensor-registry';
import { BooleanSensorRegistry } from './boolean-sensor-registry';
import { DeviceConfig } from './checking-sensor-registry';

interface TimeoutLearningData {
  lastTrueTimestamp: number | null;
  learnedTimeoutMs: number | null;
}

export class MotionSensorRegistry extends BooleanSensorRegistry {
  private timeoutLearning: Map<string, TimeoutLearningData> = new Map();
  private defaultMotionTimeoutMs: number;
  private enableLearning: boolean;

  constructor(
    homey: HomeyInstance,
    defaultMotionTimeoutMs: number,
    enableLearning: boolean,
    deviceIds: string[],
    onDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    const wrappedOnDeviceEvent: DeviceEvent = async (deviceId, value) => {
      if (typeof value === 'boolean' && this.enableLearning) {
        this.trackTimeoutLearning(deviceId, value);
      }
      await onDeviceEvent(deviceId, value);
    };

    super(homey, deviceIds, 'alarm_motion', wrappedOnDeviceEvent, log, error);
    this.defaultMotionTimeoutMs = defaultMotionTimeoutMs;
    this.enableLearning = enableLearning;
  }

  /**
   * Tracks the timing between true->false transitions to learn the timeout delay
   */
  private trackTimeoutLearning(deviceId: string, value: boolean): void {
    let data = this.timeoutLearning.get(deviceId);
    if (!data) {
      data = { lastTrueTimestamp: null, learnedTimeoutMs: null };
      this.timeoutLearning.set(deviceId, data);
    }

    const now = Date.now();

    if (value === true) {
      // Motion detected - record the timestamp
      data.lastTrueTimestamp = now;
    } else if (value === false && data.lastTrueTimestamp !== null) {
      // Motion ended - calculate duration
      const durationMs = now - data.lastTrueTimestamp;

      // Update minimum if this is shorter than what we've seen
      if (data.learnedTimeoutMs === null || durationMs < data.learnedTimeoutMs) {
        this.log(`Learned new minimum timeout for ${deviceId}: ${durationMs} ms (was ${data.learnedTimeoutMs} ms)`);
        data.learnedTimeoutMs = durationMs;
      }

      // Reset the timestamp
      data.lastTrueTimestamp = null;
    }
  }

  /**
   * Get the learned timeout for a specific device, or null if not yet learned
   */
  public getLearnedTimeout(deviceId: string): number | null {
    return this.timeoutLearning.get(deviceId)?.learnedTimeoutMs ?? null;
  }

  /**
   * Get all learned timeouts as a map of deviceId -> timeoutMs
   */
  public getAllLearnedTimeouts(): Map<string, number | null> {
    const result = new Map<string, number | null>();
    for (const [deviceId, data] of this.timeoutLearning) {
      result.set(deviceId, data.learnedTimeoutMs);
    }
    return result;
  }

  /**
   * Get the minimum learned timeout across all devices, or the default if none learned
   */
  public getMinLearnedTimeout(defaultMs: number): number {
    let min = defaultMs;
    for (const data of this.timeoutLearning.values()) {
      if (data.learnedTimeoutMs !== null && data.learnedTimeoutMs < min) {
        min = data.learnedTimeoutMs;
      }
    }
    return min;
  }

  public getDeviceConfigs(): Array<DeviceConfig> {
    return Array.from(this.deviceIds).map((id) => {
      const learnedTimeout = this.getLearnedTimeout(id);
      const defaultTimeout = this.defaultMotionTimeoutMs;
      return {
        id,
        timeoutMs: learnedTimeout ?? defaultTimeout,
      };
    });
  }
}
