/* eslint-disable import/prefer-default-export */
import { Device } from 'homey';
import { HomeyAPIV3Local } from 'homey-api';
import { getAllDevices } from './device-api';
import { getHomeyAPI } from './api';

export class BaseHomeyDevice extends Device {
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
}
