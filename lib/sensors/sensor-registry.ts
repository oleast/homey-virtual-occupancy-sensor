import { DeviceCapabilityInstance, HomeyInstance, HomeyAPIV3Local } from 'homey-api';
import { deviceHasCapability, findDeviceById } from '../homey/device-api';
import { getHomeyAPI } from '../homey/api';
import { DeviceSettings, TriggerContext } from '../types';

export type DeviceEvent = (deviceId: string, value: boolean | string | number) => void;

export class SensorRegistry<TCapabilityType extends number | string | boolean> {
  protected homey: HomeyInstance;
  protected api: HomeyAPIV3Local | null = null;
  protected deviceIds: Set<string> = new Set();
  protected capabilityId: string;
  protected capabilityType!: 'boolean' | 'string' | 'number';
  protected listeners: Map<string, DeviceCapabilityInstance> = new Map();
  protected capabilityState: Map<string, TCapabilityType> = new Map();
  protected deviceNames: Map<string, string> = new Map();
  protected onDeviceEvent: DeviceEvent;
  protected log: (message: string) => void;
  protected error: (message: string, error?: unknown) => void;

  constructor(
    homey: HomeyInstance,
    deviceIds: string[],
    capabilityId: string,
    capabilityType: 'boolean' | 'string' | 'number',
    onDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    const deviceIdsSet = new Set(deviceIds);
    this.homey = homey;
    this.deviceIds = deviceIdsSet;
    this.capabilityId = capabilityId;
    this.capabilityType = capabilityType;
    this.onDeviceEvent = onDeviceEvent;
    this.log = log;
    this.error = error;

    for (const id of deviceIdsSet) {
      this.log(`Adding listener for device ${id}`);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.addListener(id);
    }
  }

  public async updateDeviceIds(deviceIds: string[]): Promise<void> {
    const newIds = new Set(deviceIds);
    const removedIds = new Set<string>([...this.deviceIds].filter((x) => !newIds.has(x)));
    const addedIds = new Set<string>([...newIds].filter((x) => !this.deviceIds.has(x)));

    for (const id of removedIds) {
      this.log(`Removing listener for device ${id}`);
      this.removeListener(id);
    }

    for (const id of addedIds) {
      this.log(`Adding listener for device ${id}`);
      await this.addListener(id);
    }

    this.deviceIds = newIds;
  }

  public destroy(): void {
    for (const id of this.deviceIds) {
      this.log(`Removing listener for device ${id}`);
      this.removeListener(id);
    }
    this.deviceIds.clear();
  }

  public isRegistered(deviceId: string): boolean {
    return this.deviceIds.has(deviceId);
  }

  public getDeviceIds(): string[] {
    return [...this.deviceIds];
  }

  public getCapabilityStates(): Array<TCapabilityType> {
    return Array.from(this.capabilityState.values());
  }

  /**
   * Gets the cached device name for a given device ID.
   * Returns 'Unknown' if the device name is not cached.
   */
  public getDeviceName(deviceId: string): string {
    return this.deviceNames.get(deviceId) ?? 'Unknown';
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public buildContext(deviceId: string, settings: DeviceSettings): TriggerContext {
    return {
      deviceId,
      deviceName: this.getDeviceName(deviceId),
      timeoutSeconds: null,
    };
  }

  private handleDeviceEvent(deviceId: string, value: boolean | string | number | null): void {
    if (value === null) {
      this.log(`Received null value for device ${deviceId}, skipping`);
      return;
    }

    // eslint-disable-next-line valid-typeof
    if (typeof value !== this.capabilityType) {
      this.error(`Received value of incorrect type for device ${deviceId}: expected ${typeof this.capabilityType}, got ${typeof value}`);
      return;
    }
    this.capabilityState.set(deviceId, value as TCapabilityType);
    this.onDeviceEvent(deviceId, value);
  }

  private async addListener(deviceId: string): Promise<void> {
    try {
      const api = await this.getApi();
      const device = await findDeviceById(api, deviceId);
      if (!device) {
        this.error(`Could not find device instance for ${deviceId}`);
        return;
      }

      if (!deviceHasCapability(device, this.capabilityId)) {
        this.log(`Device ${device.name} (${deviceId}) does not have capability ${this.capabilityId}`);
        return;
      }

      this.deviceNames.set(deviceId, device.name || 'Unknown');

      const instance = device.makeCapabilityInstance(this.capabilityId, (value) => {
        this.handleDeviceEvent(deviceId, value);
      });

      const capabilitiesObj = device.capabilitiesObj as Record<string, HomeyAPIV3Local.ManagerDevices.CapabilityObj>;
      this.handleDeviceEvent(deviceId, capabilitiesObj[this.capabilityId].value);

      this.listeners.set(deviceId, instance);
      this.log(`Start listening to ${device.name} (${this.capabilityId})`);

    } catch (err) {
      this.error(`Failed to register listener for ${deviceId}`, err);
    }
  }

  private removeListener(deviceId: string): void {
    const instance = this.listeners.get(deviceId);
    if (instance) {
      instance.destroy();
      this.listeners.delete(deviceId);
      this.deviceNames.delete(deviceId);
      this.log(`Stopped listening to ${deviceId}`);
    }
  }

  private async getApi(): Promise<HomeyAPIV3Local> {
    if (!this.api) {
      this.api = await getHomeyAPI(this.homey);
    }
    return this.api;
  }
}
