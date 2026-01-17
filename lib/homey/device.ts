/* eslint-disable import/prefer-default-export */
import { Device } from 'homey';
import { HomeyAPIV3Local } from 'homey-api';
import { findDeviceById, getAllDevices } from './device-api';
import { getHomeyAPI } from './api';

// Re-export DeviceUpdateInfo from our extended types for convenience
export type DeviceUpdateInfo = HomeyAPIV3Local.ManagerDevices.DeviceUpdateInfo;

export class BaseHomeyDevice extends Device {
  private apiDevice: HomeyAPIV3Local.ManagerDevices.Device | null = null;
  private boundOnDeviceUpdate: ((device: HomeyAPIV3Local.ManagerDevices.Device, info: DeviceUpdateInfo) => void) | null = null;
  private boundOnOtherDeviceCreate: ((device: HomeyAPIV3Local.ManagerDevices.Device) => void) | null = null;
  private boundOnOtherDeviceDelete: ((device: HomeyAPIV3Local.ManagerDevices.Device) => void) | null = null;
  private boundOnOtherDeviceUpdate: ((device: HomeyAPIV3Local.ManagerDevices.Device, info: DeviceUpdateInfo) => void) | null = null;
  private devicesManagerConnected: boolean = false;

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
    const device = await findDeviceById(api, deviceId);
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
    if (info?.changedKeys?.includes('zone')) {
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

  /**
   * Subscribes to device manager events (device create, delete, update).
   * This allows reacting to changes in other devices in the system.
   */
  protected async subscribeToDeviceManagerEvents(): Promise<void> {
    try {
      const api = await getHomeyAPI(this.homey);

      // Connect to the devices manager to receive events
      await api.devices.connect();
      this.devicesManagerConnected = true;

      // Create bound handlers
      this.boundOnOtherDeviceCreate = this.handleOtherDeviceCreate.bind(this);
      this.boundOnOtherDeviceDelete = this.handleOtherDeviceDelete.bind(this);
      this.boundOnOtherDeviceUpdate = this.handleOtherDeviceUpdate.bind(this);

      // Subscribe to events
      api.devices.on('device.create', this.boundOnOtherDeviceCreate);
      api.devices.on('device.delete', this.boundOnOtherDeviceDelete);
      api.devices.on('device.update', this.boundOnOtherDeviceUpdate);

      this.log('Subscribed to device manager events');
    } catch (err) {
      this.error('Failed to subscribe to device manager events:', err);
    }
  }

  /**
   * Unsubscribes from device manager events.
   */
  protected async unsubscribeFromDeviceManagerEvents(): Promise<void> {
    if (!this.devicesManagerConnected) {
      return;
    }

    try {
      const api = await getHomeyAPI(this.homey);

      if (this.boundOnOtherDeviceCreate) {
        api.devices.removeListener('device.create', this.boundOnOtherDeviceCreate);
        this.boundOnOtherDeviceCreate = null;
      }
      if (this.boundOnOtherDeviceDelete) {
        api.devices.removeListener('device.delete', this.boundOnOtherDeviceDelete);
        this.boundOnOtherDeviceDelete = null;
      }
      if (this.boundOnOtherDeviceUpdate) {
        api.devices.removeListener('device.update', this.boundOnOtherDeviceUpdate);
        this.boundOnOtherDeviceUpdate = null;
      }

      await api.devices.disconnect();
      this.devicesManagerConnected = false;

      this.log('Unsubscribed from device manager events');
    } catch (err) {
      this.error('Failed to unsubscribe from device manager events:', err);
    }
  }

  private handleOtherDeviceCreate(device: HomeyAPIV3Local.ManagerDevices.Device): void {
    // Ignore events for this device
    if (device.id === this.getData().id) {
      return;
    }
    this.onOtherDeviceCreated(device);
  }

  private handleOtherDeviceDelete(device: HomeyAPIV3Local.ManagerDevices.Device): void {
    // Ignore events for this device
    if (device.id === this.getData().id) {
      return;
    }
    this.onOtherDeviceDeleted(device);
  }

  private handleOtherDeviceUpdate(
    device: HomeyAPIV3Local.ManagerDevices.Device,
    info: DeviceUpdateInfo,
  ): void {
    // Ignore events for this device (handled by subscribeToDeviceUpdates)
    if (device.id === this.getData().id) {
      return;
    }
    this.log(`Other device updated: ${device.name} (${device.id}), with info: ${JSON.stringify(info)}`);
    this.onOtherDeviceUpdated(device, info);
  }

  /**
   * Called when another device is created in the system.
   * Override this method in subclasses to react to device creation.
   */
  protected onOtherDeviceCreated(_device: HomeyAPIV3Local.ManagerDevices.Device): void {
    // Default implementation does nothing.
  }

  /**
   * Called when another device is deleted from the system.
   * Override this method in subclasses to react to device deletion.
   */
  protected onOtherDeviceDeleted(_device: HomeyAPIV3Local.ManagerDevices.Device): void {
    // Default implementation does nothing.
  }

  /**
   * Called when another device is updated in the system.
   * Override this method in subclasses to react to device updates.
   * @param device The device that was updated
   * @param info Information about what changed (zone, available, etc.)
   */
  protected onOtherDeviceUpdated(
    _device: HomeyAPIV3Local.ManagerDevices.Device,
    _info: DeviceUpdateInfo,
  ): void {
    // Default implementation does nothing.
  }
}
