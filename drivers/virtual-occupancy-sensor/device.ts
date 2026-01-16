import { OccupancyState } from '../../lib/types';
import { VirtualOccupancySensorController } from './controller';
import { MotionSensorRegistry } from '../../lib/sensors/motion-sensor-registry';
import { ContactSensorRegistry } from '../../lib/sensors/contact-sensor-registry';
import { parseSensorIdsSetting } from '../../lib/utils';
import { getDevicesWithCapability } from '../../lib/homey/device-api';
import { BaseHomeyDevice } from '../../lib/homey/device';
import { CheckingSensorRegistry } from '../../lib/sensors/checking-sensor-registry';

/* eslint-disable camelcase */
export interface DeviceSettings {
  motion_timeout: number;
  active_on_door_open: boolean;
  active_on_checking: boolean;
  door_sensors: string;
  motion_sensors: string;
}
/* eslint-enable camelcase */

export interface OnSettingsEvent {
  oldSettings: DeviceSettings;
  newSettings: DeviceSettings;
  changedKeys: Array<keyof DeviceSettings>;
}

export class VirtualOccupancySensorDevice extends BaseHomeyDevice {
  protected controller: VirtualOccupancySensorController;
  private motionSensorRegistry: MotionSensorRegistry | null = null;
  private contactSensorRegistry: ContactSensorRegistry | null = null;
  private checkingSensorRegistry: CheckingSensorRegistry | null = null;

  constructor() {
    super();
    this.controller = new VirtualOccupancySensorController(
      (state: OccupancyState) => {
        this.onStateChange(state).catch(this.error);
      },
      this.log.bind(this),
      this.error.bind(this),
    );
  }

  async onInit() {
    this.log('VirtualOccupancySensorDevice has been initialized');
    await this.initCapabilities();
    await this.setInitialCapabilityStates();
    await this.initSensorRegistries();
  }

  async onDeleted() {
    this.log('VirtualOccupancySensorDevice has been deleted');
    this.motionSensorRegistry?.destroy();
    this.contactSensorRegistry?.destroy();
  }

  // @ts-expect-error - Homey onSettings typing is incorrect
  async onSettings({ newSettings, changedKeys }: OnSettingsEvent): Promise<void> {
    this.log('Updating VirtualOccupancySensorDevice settings');

    if (changedKeys.includes('door_sensors')) {
      this.log('Door sensor settings changed, updating registry');
      const doorSensorIds = await this.getContactSensorsFromSettings(newSettings);
      await this.contactSensorRegistry?.updateDeviceIds(doorSensorIds);
    }
    if (changedKeys.includes('motion_sensors')) {
      this.log('Motion sensor settings changed, updating registry');
      const motionSensorIds = await this.getMotionsSensorsFromSettings(newSettings);
      await this.motionSensorRegistry?.updateDeviceIds(motionSensorIds);
    }

    const currentOccupancyState = this.getCapabilityValue('occupancy_state') as OccupancyState;
    this.log(`Current occupancy state while changing settings: ${currentOccupancyState}`);
    if (changedKeys.includes('active_on_checking') && currentOccupancyState === 'checking') {
      this.log('Setting active_on_checking changed while in checking state, updating alarm_motion');
      await this.setCapabilityValue('alarm_motion', newSettings.active_on_checking);
    }
    if (changedKeys.includes('active_on_door_open') && currentOccupancyState === 'door_open') {
      this.log('Setting active_on_door_open changed while in door_open state, updating alarm_motion');
      await this.setCapabilityValue('alarm_motion', newSettings.active_on_door_open);
    }
  }

  protected async onStateChange(state: OccupancyState) {
    this.log(`Device state changed to: ${state}`);
    await this.setCapabilityValue('occupancy_state', state).catch(this.error);

    const settings = this.getSettings() as DeviceSettings;
    let alarmState = false;

    switch (state) {
      case 'occupied':
        alarmState = true;
        break;
      case 'empty':
        alarmState = false;
        break;
      case 'door_open':
        alarmState = settings.active_on_door_open;
        break;
      case 'checking':
        this.handleCheckingState();
        alarmState = settings.active_on_checking;
        break;
      default:
        this.error(`Unknown occupancy state: ${state}`);
    }

    await this.setCapabilityValue('alarm_motion', alarmState).catch(this.error);
  }

  private handleCheckingState() {
    this.log('Handling checking state');

    // Always set up the CheckingSensorRegistry to wait for the full timeout period.
    // Don't short-circuit to empty based on current motion sensor state, because:
    // 1. Motion sensor may have timed out while door was still open (user lingered)
    // 2. User may be sitting still and will move again within the timeout period
    const deviceConfigs = this.motionSensorRegistry?.getDeviceConfigs() || [];
    this.checkingSensorRegistry = new CheckingSensorRegistry(
      this.homey,
      deviceConfigs,
      () => this.onCheckingTimeout(),
      this.log.bind(this),
      this.error.bind(this),
    );
  }

  private onCheckingTimeout() {
    this.log('Checking sensor timeout reached, determining next state');
    const isAnyMotionActive = this.motionSensorRegistry?.isAnyStateTrue() ?? false;

    if (isAnyMotionActive) {
      this.log('Motion sensor still active after checking timeout, transitioning to occupied');
      this.controller.registerEvent('motion_detected', 'system');
    } else {
      this.log('No motion detected during checking period, transitioning to empty');
      this.controller.registerEvent('timeout', 'system');
    }
  }

  private async initCapabilities() {
    if (!this.hasCapability('alarm_motion')) {
      this.log('Adding missing capability: alarm_motion');
      await this.addCapability('alarm_motion');
    }
    if (!this.hasCapability('occupancy_state')) {
      this.log('Adding missing capability: occupancy_state');
      await this.addCapability('occupancy_state');
    }
  }

  private async setInitialCapabilityStates() {
    // Only set defaults if not set? Or always reset?
    // Homey persists state, so usually we don't want to reset unless necessary.
    // However, the FSM starts in 'empty'.
    // A clean startup for this kind of logic usually implies starting fresh or restoring state.
    // For now, let's reset to match the FSM's initial state.
    await this.setCapabilityValue('alarm_motion', false).catch(this.error);
    await this.setCapabilityValue('occupancy_state', 'empty').catch(this.error);
  }

  private async initSensorRegistries() {
    const doorSensorIds = await this.getContactSensorsFromSettings();
    this.contactSensorRegistry = new ContactSensorRegistry(
      this.homey,
      doorSensorIds,
      this.handleContactSensorEvent.bind(this),
      this.log.bind(this),
      this.error.bind(this),
    );

    const motionSensorIds = await this.getMotionsSensorsFromSettings();
    this.motionSensorRegistry = new MotionSensorRegistry(
      this.homey,
      this.getSettings().motion_timeout * 1000,
      motionSensorIds,
      this.handleMotionSensorEvent.bind(this),
      this.log.bind(this),
      this.error.bind(this),
    );
  }

  private async handleContactSensorEvent(deviceId: string, value: boolean | number | string): Promise<void> {
    if (typeof value !== 'boolean') {
      this.log(`Ignoring non-boolean contact sensor value from ${deviceId}: ${value}`);
      return;
    }
    this.log(`Door event triggered on sensor ${deviceId}, native value:${value}`);

    if (value) {
      this.log(`Door opened event triggered on sensor ${deviceId}`);
      this.controller.registerEvent('any_door_open', deviceId);
    } else {
      const allDoorsClosed = this.contactSensorRegistry?.isAllStateFalse() ?? false;
      if (!allDoorsClosed) {
        this.log(`Not all doors are closed after door close on sensor ${deviceId}, ignoring event`);
      } else {
        this.log(`Door closed on sensor ${deviceId}, all doors closed: ${allDoorsClosed}`);
        this.controller.registerEvent('all_doors_closed', deviceId);
      }
    }
  }

  private async handleMotionSensorEvent(deviceId: string, value: boolean | number | string): Promise<void> {
    if (typeof value !== 'boolean') {
      this.log(`Got non-boolean motion sensor value from ${deviceId}: ${value}`);
      return;
    }
    this.log(`Motion event triggered on sensor ${deviceId}, native value: ${value}`);
    const eventType = value ? 'motion_detected' : 'motion_timeout';
    this.controller.registerEvent(eventType, deviceId);
  }

  private async getContactSensorsInZone(): Promise<string[]> {
    const api = await this.getApi();
    const deviceId = await this.getDeviceId();
    const zoneId = await this.getZoneId();
    const allContactDevices = await getDevicesWithCapability(api, 'alarm_contact');
    const allContactDevicesInZone = allContactDevices.filter((device) => device.zone === zoneId && device.id !== deviceId);
    this.log(`Found ${allContactDevicesInZone.length} contact sensors in zone ${zoneId}. Named: ${allContactDevicesInZone.map((d) => d.name).join(', ')}`);
    return allContactDevicesInZone.map((device) => device.id);
  }

  private async getMotionSensorsInZone(): Promise<string[]> {
    const api = await this.getApi();
    const deviceId = await this.getDeviceId();
    const zoneId = await this.getZoneId();
    const allMotionDevices = await getDevicesWithCapability(api, 'alarm_motion');
    const allMotionDevicesInZone = allMotionDevices.filter((device) => device.zone === zoneId && device.id !== deviceId);
    this.log(`Found ${allMotionDevicesInZone.length} motion sensors in zone ${zoneId}. Named: ${allMotionDevicesInZone.map((d) => d.name).join(', ')}`);
    return allMotionDevicesInZone.map((device) => device.id);
  }

  private async getMotionsSensorsFromSettings(settings: DeviceSettings = this.getSettings()): Promise<string[]> {
    let motionSensorIds = parseSensorIdsSetting(settings.motion_sensors);
    if (motionSensorIds.length === 0) {
      this.log('No motion sensor ids configured, using automatic zone detection');
      motionSensorIds = await this.getMotionSensorsInZone();
      this.log(`Auto-detected motion sensors in zone: ${motionSensorIds.join(', ')}`);
    }
    return motionSensorIds;
  }

  private async getContactSensorsFromSettings(settings: DeviceSettings = this.getSettings()): Promise<string[]> {
    let doorSensorIds = parseSensorIdsSetting(settings.door_sensors);
    if (doorSensorIds.length === 0) {
      this.log('No door sensor ids configured, using automatic zone detection');
      doorSensorIds = await this.getContactSensorsInZone();
      this.log(`Auto-detected door sensors in zone: ${doorSensorIds.join(', ')}`);
    }
    return doorSensorIds;
  }
}

module.exports = VirtualOccupancySensorDevice;
