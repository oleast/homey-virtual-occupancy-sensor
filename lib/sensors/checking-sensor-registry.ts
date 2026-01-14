import { HomeyInstance } from 'homey-api';
import { VirtualCheckingSensor } from './checking-sensor';

export type DeviceEvent = () => void;

export interface DeviceConfig {
  id: string;
  timeoutMs: number;
}

export class CheckingSensorRegistry {
  protected homey: HomeyInstance;
  protected deviceConfigs: Array<DeviceConfig>;
  protected listeners: Map<string, VirtualCheckingSensor> = new Map();
  protected triggeredDevices: Set<string> = new Set();
  protected handleDeviceEvent: DeviceEvent;
  protected log: (message: string) => void;
  protected error: (message: string, error?: unknown) => void;

  constructor(
    homey: HomeyInstance,
    deviceConfigs: Array<DeviceConfig>,
    handleDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    this.homey = homey;
    this.deviceConfigs = deviceConfigs;
    this.handleDeviceEvent = handleDeviceEvent;
    this.log = log;
    this.error = error;

    for (const config of deviceConfigs) {
      this.log(`Adding listener for device ${config.id}`);
      this.addListener(config);
    }
  }

  public async updateDevices(deviceConfigs: Array<DeviceConfig>): Promise<void> {
    const addedDevices = deviceConfigs.filter((config) => !this.deviceConfigs.map((existingConfig) => existingConfig.id).includes(config.id));
    const removedDevices = this.deviceConfigs.filter((config) => !deviceConfigs.map((newConfig) => newConfig.id).includes(config.id));

    for (const config of removedDevices) {
      this.log(`Removing listener for device ${config.id}`);
      this.removeListener(config);
    }

    for (const config of addedDevices) {
      this.log(`Adding listener for device ${config.id}`);
      await this.addListener(config);
    }

    this.deviceConfigs = deviceConfigs;
  }

  public destroy(): void {
    for (const config of this.deviceConfigs) {
      this.log(`Removing listener for device ${config.id}`);
      this.removeListener(config);
    }
    this.deviceConfigs = [];
  }

  public startChecking(): void {
    this.triggeredDevices.clear();
    for (const [, instance] of this.listeners) {
      instance.start();
    }
  }

  public stopChecking(): void {
    this.triggeredDevices.clear();
    for (const [, instance] of this.listeners) {
      instance.stop();
    }
  }

  public isRegistered(deviceId: string): boolean {
    return this.deviceConfigs.some((config) => config.id === deviceId);
  }

  private async handleDeviceEventCallback(deviceId: string): Promise<void> {
    this.triggeredDevices.add(deviceId);
    this.log(`Device ${deviceId} triggered (${this.triggeredDevices.size}/${this.listeners.size} devices triggered)`);

    // Only fire the callback when ALL devices have triggered
    if (this.triggeredDevices.size >= this.listeners.size) {
      this.log('All devices have triggered, firing callback');
      await this.handleDeviceEvent();
      this.triggeredDevices.clear();
      for (const config of this.deviceConfigs) {
        this.removeListener(config);
      }
    }
  }

  private async addListener(deviceConfig: DeviceConfig): Promise<void> {
    const device = new VirtualCheckingSensor(this.homey, () => this.handleDeviceEventCallback(deviceConfig.id),
      deviceConfig.timeoutMs,
      this.log,
      this.error);
    this.listeners.set(deviceConfig.id, device);
    this.log(`Start listening to checking sensor for device ${deviceConfig.id}`);
  }

  private removeListener(deviceConfig: DeviceConfig): void {
    const instance = this.listeners.get(deviceConfig.id);
    if (instance) {
      instance.stop();
      this.listeners.delete(deviceConfig.id);
      this.log(`Stopped listening to ${deviceConfig.id}`);
    }
  }
}
