/* eslint-disable import/prefer-default-export */
import { HomeyInstance } from 'homey-api';
import { DeviceEvent } from './sensor-registry';
import { BooleanSensorRegistry } from './boolean-sensor-registry';

export class ContactSensorRegistry extends BooleanSensorRegistry {
  constructor(
    homey: HomeyInstance,
    deviceIds: string[],
    handleDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    super(homey, deviceIds, 'alarm_contact', handleDeviceEvent, log, error);
  }
}
