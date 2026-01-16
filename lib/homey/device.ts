/* eslint-disable import/prefer-default-export */
import { Device } from 'homey';
import { HomeyAPIV3Local } from 'homey-api';
import { findDeviceById, getAllDevices } from './device-api';
import { getHomeyAPI } from './api';

export interface DeviceUpdateInfo {
  zone?: boolean;
}

export class BaseHomeyDevice extends Device {
  private apiDevice: HomeyAPIV3Local.ManagerDevices.Device | null = null;
  private boundOnDeviceUpdate: ((device: HomeyAPIV3Local.ManagerDevices.Device, info: DeviceUpdateInfo) => void) | null = null;

  protected async getDeviceId(): Promise<string> {
    const data = this.getData();
    if (!data.id) {
      this.log('Device data has no ID field');
    }

    const api = await getHomeyAPI(this.homey);
    const allDevices = await getAllDevices(api);
    // @ts-expect-error - data.id exists
    const thisDevice = Object.values(allDevices).find((device) => device.data.id === data.id);
    if (!thisDevice) {
      this.error(`Device with ID ${data.id} not found in Homey devices`);
    }
    return thisDevice?.id ?? '';
  }

  protected async getZoneId(): Promise<string | null> {
    const deviceId = await this.getDeviceId();
    const api = await getHomeyAPI(this.homey);
    const allDevices = await getAllDevices(api);
    const device = allDevices[deviceId];
    if (!device) {
      this.error(`Current device with ID ${deviceId} not found in Homey devices`);
      return null;
    }
    if (!device.zone) {
      this.error(`Current device with ID ${deviceId} has no zone assigned`);
      return null;
    }
    return device.zone;
  }

  protected async getApi(): Promise<HomeyAPIV3Local> {
    return getHomeyAPI(this.homey);
  }

  /**
   * Subscribe to device updates from the Homey API.
   * Call this in onInit() if you need to react to device property changes (e.g., zone changes).
   */
  protected async subscribeToDeviceUpdates(): Promise<void> {
    try {
      const api = await this.getApi();
      const deviceId = await this.getDeviceId();
      this.apiDevice = await findDeviceById(api, deviceId);

      if (!this.apiDevice) {
        this.error('Could not find device in API for update subscription');
        return;
      }

      await this.apiDevice.connect();
      this.boundOnDeviceUpdate = this.handleDeviceUpdate.bind(this);
      this.apiDevice.on('update', this.boundOnDeviceUpdate);
      this.log('Subscribed to device updates');
    } catch (err) {
      this.error('Failed to subscribe to device updates:', err);
    }
  }

  /**
   * Unsubscribe from device updates.
   * Call this in onDeleted() if you called subscribeToDeviceUpdates() in onInit().
   */
  protected unsubscribeFromDeviceUpdates(): void {
    if (this.apiDevice && this.boundOnDeviceUpdate) {
      this.apiDevice.removeListener('update', this.boundOnDeviceUpdate);
      this.apiDevice.disconnect().catch(this.error);
      this.apiDevice = null;
      this.boundOnDeviceUpdate = null;
      this.log('Unsubscribed from device updates');
    }
  }

  private handleDeviceUpdate(
    _device: HomeyAPIV3Local.ManagerDevices.Device,
    info: DeviceUpdateInfo,
  ): void {
    if (info.zone) {
      this.log('Device zone changed');
      this.onZoneChanged();
    }
  }

  /**
   * Called when the device is moved to a different zone.
   * Override this method in subclasses to react to zone changes.
   */
  protected onZoneChanged(): void {
    // Default implementation does nothing.
    // Subclasses can override to handle zone changes.
  }
}
