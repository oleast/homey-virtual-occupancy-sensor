/* eslint-disable import/prefer-default-export */
import { HomeyInstance } from 'homey-api';
import { DeviceEvent } from './sensor-registry';
import { BooleanSensorRegistry } from './boolean-sensor-registry';
import { DeviceConfig } from './checking-sensor-registry';
import { DeviceSettings, TriggerContext } from '../types';
import TimeoutStore from '../storage/timeout-store';

const MIN_LEARNED_TIMEOUT_MS = 1000;

export interface TimeoutLearningData {
  lastTrueTimestamp: number | null;
  learnedTimeoutMs: number | null;
}

export class MotionSensorRegistry extends BooleanSensorRegistry {
  private timeoutLearning: Map<string, TimeoutLearningData> = new Map();
  private defaultMotionTimeoutMs: number;
  private enableLearning: boolean;
  private readonly timeoutStore: TimeoutStore;

  constructor(
    homey: HomeyInstance,
    defaultMotionTimeoutMs: number,
    enableLearning: boolean,
    deviceIds: string[],
    onDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
    timeoutStore: TimeoutStore,
  ) {
    const wrappedOnDeviceEvent: DeviceEvent = (deviceId, value) => {
      if (typeof value === 'boolean' && this.enableLearning) {
        this.trackTimeoutLearning(deviceId, value);
      }
      onDeviceEvent(deviceId, value);
    };

    super(homey, deviceIds, 'alarm_motion', wrappedOnDeviceEvent, log, error);
    this.defaultMotionTimeoutMs = defaultMotionTimeoutMs;
    this.enableLearning = enableLearning;
    this.timeoutStore = timeoutStore;

    // Load stored timeout data
    const data = this.timeoutStore.load();
    if (data.size > 0) {
      this.timeoutLearning = data;
      this.log(`Restored learned timeouts for ${data.size} sensors`);
    }
  }

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
      const clampedDurationMs = Math.max(durationMs, MIN_LEARNED_TIMEOUT_MS);

      // Update minimum if this is shorter than what we've seen
      if (data.learnedTimeoutMs === null || clampedDurationMs < data.learnedTimeoutMs) {
        this.log(`Learned new minimum timeout for ${deviceId}: ${clampedDurationMs} ms (was ${data.learnedTimeoutMs} ms)`);
        data.learnedTimeoutMs = clampedDurationMs;
        this.timeoutStore.save(this.getAllLearnedTimeouts()).catch((err) => {
          this.error('Failed to save learned timeout', err);
        });
      }

      // Reset the timestamp
      data.lastTrueTimestamp = null;
    }
  }

  public getLearnedTimeout(deviceId: string): number | null {
    return this.timeoutLearning.get(deviceId)?.learnedTimeoutMs ?? null;
  }

  public getAllLearnedTimeouts(): Map<string, number | null> {
    const result = new Map<string, number | null>();
    for (const [deviceId, data] of this.timeoutLearning) {
      result.set(deviceId, data.learnedTimeoutMs);
    }
    return result;
  }

  /**
   * Removes learned timeout data for a specific device.
   *
   * This removes the timeout learning data from the internal Map and
   * persists the removal to storage.
   *
   * @remarks
   * Safe to call with a deviceId that doesn't exist in the timeout learning
   * data - the operation will simply have no effect.
   *
   * @param deviceId - The ID of the device to remove timeout data for
   */
  public removeDevice(deviceId: string): void {
    this.timeoutLearning.delete(deviceId);
    this.timeoutStore.remove(deviceId).catch((err) => {
      this.error(`Failed to remove timeout for device ${deviceId}`, err);
    });
  }

  /**
   * Updates the list of device IDs and cleans up removed devices.
   *
   * @param deviceIds - The new list of device IDs to monitor
   */
  public override async updateDeviceIds(deviceIds: string[]): Promise<void> {
    const oldIds = new Set(this.getDeviceIds());
    const newIds = new Set(deviceIds);

    // Call parent to handle listener management
    await super.updateDeviceIds(deviceIds);

    // Clean up removed devices from timeout learning
    for (const oldId of oldIds) {
      if (!newIds.has(oldId)) {
        this.removeDevice(oldId);
      }
    }
  }

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

  public override buildContext(deviceId: string, settings: DeviceSettings): TriggerContext {
    const learnedTimeout = this.getLearnedTimeout(deviceId);
    const timeoutMs = learnedTimeout ?? (settings.motion_timeout * 1000);
    const timeoutSeconds = Math.round(timeoutMs / 1000);

    return {
      deviceId,
      deviceName: this.getDeviceName(deviceId),
      timeoutSeconds,
    };
  }
}
