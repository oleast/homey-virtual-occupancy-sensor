/* eslint-disable import/prefer-default-export */
import { Device } from 'homey';
import { HomeyAPIV3Local } from 'homey-api';
import { getAllDevices } from './device-api';
import { getHomeyAPI } from './api';

export class BaseHomeyDevice extends Device {
  get deviceId(): string {
    const data = this.getData();
    if (!data.id) {
      this.log('Device data has no ID field');
    }
    return data.id;
  }

  protected async getZoneId(): Promise<string | null> {
    const api = await getHomeyAPI(this.homey);
    const allDevices = await getAllDevices(api);
    const device = allDevices[this.deviceId];
    if (!device) {
      this.error(`Current device with ID ${this.deviceId} not found in Homey devices`);
      return null;
    }
    if (!device.zone) {
      this.error(`Current device with ID ${this.deviceId} has no zone assigned`);
      return null;
    }
    return device.zone;
  }

  protected async getApi(): Promise<HomeyAPIV3Local> {
    return getHomeyAPI(this.homey);
  }
}
