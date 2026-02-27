import type { HomeyAPIV3Local } from 'homey-api';
import Homey from 'homey';
import {
  DeviceSettings, EventType, OccupancyState, TriggerContext,
} from '../../lib/types';
import { VirtualOccupancySensorController } from './controller';
import { MotionSensorRegistry } from '../../lib/sensors/motion-sensor-registry';
import { ContactSensorRegistry } from '../../lib/sensors/contact-sensor-registry';
import { parseSensorIdsSetting } from '../../lib/utils';
import { getDevicesWithCapability } from '../../lib/homey/device-api';
import { BaseHomeyDevice, DeviceUpdateInfo } from '../../lib/homey/device';
import { getAllZones, getZoneIdsForSearch } from '../../lib/homey/zone-api';
import { CheckingSensorRegistry } from '../../lib/sensors/checking-sensor-registry';

export interface OnSettingsEvent {
  oldSettings: DeviceSettings;
  newSettings: DeviceSettings;
  changedKeys: Array<keyof DeviceSettings>;
}

// Interface for driver's flow trigger methods (defined after DeviceSettings but before class)
/* eslint-disable no-use-before-define */
interface VirtualOccupancySensorDriverInterface extends Homey.Driver {
  triggerOccupancyStateChanged(device: VirtualOccupancySensorDevice, state: OccupancyState, context: TriggerContext): void;
  triggerBecameOccupied(device: VirtualOccupancySensorDevice, context: TriggerContext): void;
  triggerBecameEmpty(device: VirtualOccupancySensorDevice, context: TriggerContext): void;
  triggerDoorOpened(device: VirtualOccupancySensorDevice, context: TriggerContext): void;
  triggerCheckingStarted(device: VirtualOccupancySensorDevice, context: TriggerContext): void;
}
/* eslint-enable no-use-before-define */

export class VirtualOccupancySensorDevice extends BaseHomeyDevice {
  protected controller!: VirtualOccupancySensorController;
  private motionSensorRegistry!: MotionSensorRegistry;
  private contactSensorRegistry!: ContactSensorRegistry;
  private checkingSensorRegistry: CheckingSensorRegistry | null = null;

  async onInit() {
    this.controller = new VirtualOccupancySensorController(
      (state: OccupancyState, context: TriggerContext) => {
        this.onStateChange(state, context).catch(this.error);
      },
      this.log.bind(this),
      this.error.bind(this),
    );
    this.log('VirtualOccupancySensorDevice has been initialized');
    await this.initCapabilities();
    await this.setInitialCapabilityStates();
    await this.initSensorRegistries();
    await this.subscribeToDeviceUpdates();
    await this.subscribeToDeviceManagerEvents();
  }

  async onDeleted() {
    this.log('VirtualOccupancySensorDevice has been deleted');
    this.unsubscribeFromDeviceUpdates();
    await this.unsubscribeFromDeviceManagerEvents();
    this.motionSensorRegistry.destroy();
    this.contactSensorRegistry.destroy();
  }

  protected onZoneChanged(): void {
    this.log('Zone changed, refreshing auto-detected sensors');
    this.refreshAutoDetectedSensors().catch(this.error);
  }

  protected onOtherDeviceCreated(device: HomeyAPIV3Local.ManagerDevices.Device): void {
    this.handleOtherDeviceChange(device, 'created');
  }

  protected onOtherDeviceDeleted(device: HomeyAPIV3Local.ManagerDevices.Device): void {
    this.handleOtherDeviceChange(device, 'deleted');
  }

  protected onOtherDeviceUpdated(
    device: HomeyAPIV3Local.ManagerDevices.Device,
    info: DeviceUpdateInfo,
  ): void {
    if (!info || !info.changedKeys) {
      return;
    }
    if (info.changedKeys.includes('zone') || info.changedKeys.includes('available')) {
      this.handleOtherDeviceChange(device, 'updated', info);
    }
  }

  private handleOtherDeviceChange(
    device: HomeyAPIV3Local.ManagerDevices.Device,
    changeType: 'created' | 'deleted' | 'updated',
    info?: DeviceUpdateInfo,
  ): void {
    const settings = this.getSettings() as DeviceSettings;
    const capabilities = device.capabilities || [];

    const hasMotionCapability = capabilities.includes('alarm_motion');
    const hasContactCapability = capabilities.includes('alarm_contact');

    if (!hasMotionCapability && !hasContactCapability) {
      return;
    }

    const autoDetectMotion = settings.auto_detect_motion_sensors && hasMotionCapability;
    const autoDetectContact = settings.auto_detect_door_sensors && hasContactCapability;

    if (!autoDetectMotion && !autoDetectContact) {
      return;
    }

    const details = info?.changedKeys
      ? ` (changed: ${info.changedKeys.join(', ')})`
      : '';
    this.log(`Relevant device ${changeType}: ${device.name}${details}`);

    this.refreshAutoDetectedSensors().catch(this.error);
  }

  // @ts-expect-error - Homey onSettings typing is incorrect
  async onSettings({ newSettings, changedKeys }: OnSettingsEvent): Promise<void> {
    this.log('Updating VirtualOccupancySensorDevice settings');

    const needsContactSensorReload = changedKeys.includes('door_sensors')
      || changedKeys.includes('auto_detect_door_sensors')
      || changedKeys.includes('include_child_zones_contact');
    const needsMotionSensorReload = changedKeys.includes('motion_sensors')
      || changedKeys.includes('auto_detect_motion_sensors')
      || changedKeys.includes('include_child_zones_motion');

    if (needsContactSensorReload) {
      this.log('Door sensor or zone settings changed, updating registry');
      const doorSensorIds = await this.getContactSensorsFromSettings(newSettings);
      await this.contactSensorRegistry.updateDeviceIds(doorSensorIds);
    }
    if (needsMotionSensorReload) {
      this.log('Motion sensor or zone settings changed, updating registry');
      const motionSensorIds = await this.getMotionsSensorsFromSettings(newSettings);
      await this.motionSensorRegistry.updateDeviceIds(motionSensorIds);
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
    if (changedKeys.includes('active_on_occupied') && currentOccupancyState === 'occupied') {
      this.log('Setting active_on_occupied changed while in occupied state, updating alarm_motion');
      await this.setCapabilityValue('alarm_motion', newSettings.active_on_occupied);
    }
    if (changedKeys.includes('active_on_empty') && currentOccupancyState === 'empty') {
      this.log('Setting active_on_empty changed while in empty state, updating alarm_motion');
      await this.setCapabilityValue('alarm_motion', newSettings.active_on_empty);
    }
  }

  protected async onStateChange(state: OccupancyState, context: TriggerContext) {
    this.log(`Device state changed to: ${state}, triggered by: ${context.deviceName} (${context.deviceId})`);

    if (state !== 'checking' && this.checkingSensorRegistry) {
      this.log('Stopping checking sensor');
      this.checkingSensorRegistry.stopChecking();
      this.checkingSensorRegistry = null;
    }

    await this.setCapabilityValue('occupancy_state', state).catch(this.error);
    await this.triggerStateChangeFlows(state, context);

    const settings = this.getSettings() as DeviceSettings;
    let alarmState = false;

    switch (state) {
      case 'occupied':
        alarmState = settings.active_on_occupied;
        break;
      case 'empty':
        alarmState = settings.active_on_empty;
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

  private async triggerStateChangeFlows(state: OccupancyState, context: TriggerContext): Promise<void> {
    const driver = this.driver as VirtualOccupancySensorDriverInterface;

    if (typeof driver?.triggerOccupancyStateChanged !== 'function') {
      return;
    }

    driver.triggerOccupancyStateChanged(this, state, context);

    switch (state) {
      case 'occupied':
        driver.triggerBecameOccupied(this, context);
        break;
      case 'empty':
        driver.triggerBecameEmpty(this, context);
        break;
      case 'door_open':
        driver.triggerDoorOpened(this, context);
        break;
      case 'checking':
        driver.triggerCheckingStarted(this, context);
        break;
      default:
        break;
    }
  }

  public triggerEventFromFlow(eventType: EventType): void {
    this.log(`Flow action: triggering manual event: ${eventType}`);
    const context: TriggerContext = {
      deviceId: 'flow_action',
      deviceName: 'Flow Action',
      timeoutSeconds: null,
    };
    this.controller.registerEvent(eventType, context);
  }

  private handleCheckingState() {
    this.log('Handling checking state');

    // Always set up the CheckingSensorRegistry to wait for the full timeout period.
    // Don't short-circuit to empty based on current motion sensor state, because:
    // 1. Motion sensor may have timed out while door was still open (user lingered)
    // 2. User may be sitting still and will move again within the timeout period
    const deviceConfigs = this.motionSensorRegistry.getDeviceConfigs() || [];
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
    const isAnyMotionActive = this.motionSensorRegistry.isAnyStateTrue() ?? false;

    const settings = this.getSettings() as DeviceSettings;
    const context: TriggerContext = {
      deviceId: 'system',
      deviceName: 'Checking Timeout',
      timeoutSeconds: settings.motion_timeout,
    };

    if (isAnyMotionActive) {
      this.log('Motion sensor still active after checking timeout, transitioning to occupied');
      this.controller.registerEvent('motion_detected', context);
    } else {
      this.log('No motion detected during checking period, transitioning to empty');
      this.controller.registerEvent('timeout', context);
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
    // Homey persists state, so usually we don't want to reset unless necessary.
    // However, the FSM starts in 'empty'. So if persisted state is 'occupied' or 'door_open',
    // we need to reset it to 'empty' on init.
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
    const settings = this.getSettings();
    this.motionSensorRegistry = new MotionSensorRegistry(
      this.homey,
      settings.motion_timeout * 1000,
      settings.auto_learn_timeout,
      motionSensorIds,
      this.handleMotionSensorEvent.bind(this),
      this.log.bind(this),
      this.error.bind(this),
    );
  }

  private async refreshAutoDetectedSensors() {
    const settings = this.getSettings() as DeviceSettings;

    if (settings.auto_detect_door_sensors) {
      this.log('Refreshing auto-detected door sensors after zone change');
      const doorSensorIds = await this.getContactSensorsFromSettings(settings);
      await this.contactSensorRegistry.updateDeviceIds(doorSensorIds);
    }

    if (settings.auto_detect_motion_sensors) {
      this.log('Refreshing auto-detected motion sensors after zone change');
      const motionSensorIds = await this.getMotionsSensorsFromSettings(settings);
      await this.motionSensorRegistry.updateDeviceIds(motionSensorIds);
    }
  }

  private handleContactSensorEvent(deviceId: string, value: boolean | number | string): void {
    if (typeof value !== 'boolean') {
      this.log(`Ignoring non-boolean contact sensor value from ${deviceId}: ${value}`);
      return;
    }
    this.log(`Door event triggered on sensor ${deviceId}, native value:${value}`);

    const settings = this.getSettings() as DeviceSettings;
    const context = this.contactSensorRegistry.buildContext(deviceId, settings);

    if (value) {
      this.log(`Door opened event triggered on sensor ${deviceId}`);
      this.controller.registerEvent('any_door_open', context);
    } else {
      const allDoorsClosed = this.contactSensorRegistry.isAllStateFalse();
      if (!allDoorsClosed) {
        this.log(`Not all doors are closed after door close on sensor ${deviceId}, ignoring event`);
      } else {
        this.log(`Door closed on sensor ${deviceId}, all doors closed: ${allDoorsClosed}`);
        this.controller.registerEvent('all_doors_closed', context);
      }
    }
  }

  private handleMotionSensorEvent(deviceId: string, value: boolean | number | string): void {
    if (typeof value !== 'boolean') {
      this.log(`Got non-boolean motion sensor value from ${deviceId}: ${value}`);
      return;
    }
    this.log(`Motion event triggered on sensor ${deviceId}, native value: ${value}`);

    const settings = this.getSettings() as DeviceSettings;
    const context = this.motionSensorRegistry.buildContext(deviceId, settings);

    const eventType = value ? 'motion_detected' : 'motion_timeout';
    this.controller.registerEvent(eventType, context);
  }

  private async getContactSensorsInZone(includeChildZones: boolean = false): Promise<string[]> {
    const api = await this.getApi();
    const deviceId = await this.getDeviceId();
    const zoneId = await this.getZoneId();
    if (!zoneId) return [];

    const allZones = await getAllZones(api);
    const zoneIds = getZoneIdsForSearch(allZones, zoneId, includeChildZones);

    const allContactDevices = await getDevicesWithCapability(api, 'alarm_contact');
    const matchingDevices = allContactDevices.filter(
      (device) => device.zone && zoneIds.includes(device.zone) && device.id !== deviceId,
    );

    const zoneDescription = includeChildZones ? `zone ${zoneId} and child zones` : `zone ${zoneId}`;
    this.log(`Found ${matchingDevices.length} contact sensors in ${zoneDescription}. Named: ${matchingDevices.map((d) => d.name).join(', ')}`);
    return matchingDevices.map((device) => device.id);
  }

  private async getMotionSensorsInZone(includeChildZones: boolean = false): Promise<string[]> {
    const api = await this.getApi();
    const deviceId = await this.getDeviceId();
    const zoneId = await this.getZoneId();
    if (!zoneId) return [];

    const allZones = await getAllZones(api);
    const zoneIds = getZoneIdsForSearch(allZones, zoneId, includeChildZones);

    const allMotionDevices = await getDevicesWithCapability(api, 'alarm_motion');
    const matchingDevices = allMotionDevices.filter(
      (device) => device.zone && zoneIds.includes(device.zone) && device.id !== deviceId,
    );

    const zoneDescription = includeChildZones ? `zone ${zoneId} and child zones` : `zone ${zoneId}`;
    this.log(`Found ${matchingDevices.length} motion sensors in ${zoneDescription}. Named: ${matchingDevices.map((d) => d.name).join(', ')}`);
    return matchingDevices.map((device) => device.id);
  }

  private async getMotionsSensorsFromSettings(settings: DeviceSettings = this.getSettings()): Promise<string[]> {
    const motionSensorIds = parseSensorIdsSetting(settings.motion_sensors);

    if (settings.auto_detect_motion_sensors) {
      this.log('Auto-detection enabled, searching for motion sensors in zone');
      const autoDetectedIds = await this.getMotionSensorsInZone(settings.include_child_zones_motion);
      this.log(`Auto-detected motion sensors: ${autoDetectedIds.join(', ')}`);
      return [...new Set([...motionSensorIds, ...autoDetectedIds])];
    }

    return motionSensorIds;
  }

  private async getContactSensorsFromSettings(settings: DeviceSettings = this.getSettings()): Promise<string[]> {
    const doorSensorIds = parseSensorIdsSetting(settings.door_sensors);

    if (settings.auto_detect_door_sensors) {
      this.log('Auto-detection enabled, searching for door sensors in zone');
      const autoDetectedIds = await this.getContactSensorsInZone(settings.include_child_zones_contact);
      this.log(`Auto-detected door sensors: ${autoDetectedIds.join(', ')}`);
      return [...new Set([...doorSensorIds, ...autoDetectedIds])];
    }

    return doorSensorIds;
  }
}

module.exports = VirtualOccupancySensorDevice;
