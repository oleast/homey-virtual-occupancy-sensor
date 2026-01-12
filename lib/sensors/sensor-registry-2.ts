import { HomeyAPIV3, HomeyInstance } from 'homey-api';
import { deviceHasCapability, findDeviceById } from '../homey/device-api';

export type DeviceEvent = (deviceId: string, value: boolean | string | number) => Promise<void>;

export class SensorRegistry2 {
  protected homey: HomeyInstance;
  protected deviceIds: Set<string> = new Set();
  protected capabilityId: string;
  protected listeners: Map<string, HomeyAPIV3.ManagerDevices.Device.DeviceCapability> = new Map();
  protected handleDeviceEvent: DeviceEvent;
  protected log: (message: string) => void;
  protected error: (message: string, error?: unknown) => void;

  constructor(
    homey: HomeyInstance,
    deviceIds: string[],
    capabilityId: string,
    handleDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    this.homey = homey;
    this.deviceIds = new Set(deviceIds);
    this.capabilityId = capabilityId;
    this.handleDeviceEvent = handleDeviceEvent;
    this.log = log;
    this.error = error;
  }

  public async updateDeviceIds(deviceIds: string[]): Promise<void> {
    const newIds = new Set(deviceIds);
    const removedIds = new Set<string>([...this.deviceIds].filter(x => !newIds.has(x)));
    const addedIds = new Set<string>([...newIds].filter(x => !this.deviceIds.has(x)));

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

  public async isAnySensorActive(): Promise<boolean> {
    for (const deviceId of this.deviceIds) {
      const device = await findDeviceById(this.homey, deviceId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (device && (device as any).capabilitiesObj && (device as any).capabilitiesObj[this.capabilityId]?.value) {
        return true;
      }
    }
    return false;
  }

  private async addListener(deviceId: string): Promise<void> {
    try {
      const device = await findDeviceById(this.homey, deviceId);
      if (!device) {
        this.error(`Could not find device instance for ${deviceId}`);
        return;
      }

      if (!(await deviceHasCapability(device, this.capabilityId))) {
        this.log(`Device ${device.name} (${deviceId}) does not have capability ${this.capabilityId}`);
        return;
      }

      const instance = device.makeCapabilityInstance(this.capabilityId, (value) => {
        this.handleDeviceEvent(deviceId, value).catch(err => {
          this.error(`Error handling capability event for device ${deviceId}`, err);
        });
      });

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
      this.log(`Stopped listening to ${deviceId}`);
    }
  }
}
