/* eslint-disable import/prefer-default-export */
import { HomeyInstance } from 'homey-api';
import { DeviceEvent, SensorRegistry } from './sensor-registry';

export class ContactSensorRegistry extends SensorRegistry<boolean> {
  constructor(
    homey: HomeyInstance,
    deviceIds: string[],
    handleDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    super(homey, deviceIds, 'alarm_contact', 'boolean', handleDeviceEvent, log, error);
  }
}
