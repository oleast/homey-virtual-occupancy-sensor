import { HomeyAPI } from 'homey-api';
import {
  HomeyDevice, MonitorCallbacks, ManagerDevicesWithConnect, HomeyInstance,
} from '../../lib/types';
import { findVirtualDevice, findSensorsInZone, isAnyCapabilityActive } from '../../lib/utils';
import SensorRegistry from '../../lib/sensor-registry';
import CapabilityListenerManager from '../../lib/capability-listener-manager';

export default class SensorMonitor {
  private homey: HomeyInstance;
  private deviceId: string;
  private callbacks: MonitorCallbacks;

  // Components
  private registry: SensorRegistry;
  private listeners: CapabilityListenerManager;

  // API State
  private devicesApi: ManagerDevicesWithConnect | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deviceUpdateListener: ((device: HomeyDevice, changes?: any) => void) | null = null;

  constructor(homey: HomeyInstance, deviceId: string, callbacks: MonitorCallbacks) {
    this.homey = homey;
    this.deviceId = deviceId;
    this.callbacks = callbacks;
    this.registry = new SensorRegistry();
    this.listeners = new CapabilityListenerManager(callbacks, this.handleCapabilityEvent.bind(this));
  }

  /**
   * Central handler for events
   */
  private async handleCapabilityEvent(deviceId: string, capabilityId: string, value: boolean): Promise<void> {
    if (capabilityId === 'alarm_contact') {
      await this.handleDoorChange(deviceId, value);
    } else if (capabilityId === 'alarm_motion') {
      await this.handleMotionChange(deviceId, value);
    }
  }

  /**
   * Initialize the monitor: get API and start listening
   */
  async init(): Promise<void> {
    try {
      this.callbacks.log('Initializing SensorMonitor...');
      const api = await this.getHomeyAPI();
      this.callbacks.log('API created, getting devices manager...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.devicesApi = (api as any).devices;

      this.startListening();

      this.callbacks.log('Listeners registered. Connecting to devices manager...');
      // Required for homey-api v3 to start receiving events
      if (this.devicesApi) await this.devicesApi.connect();
      this.callbacks.log('Successfully connected to devices manager.');

    } catch (error) {
      this.callbacks.error('Failed to initialize SensorMonitor:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.devicesApi) {
      if (this.deviceUpdateListener) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.devicesApi as any).off('device.update', this.deviceUpdateListener);
        this.deviceUpdateListener = null;
      }
    }

    this.listeners.clear();
    this.devicesApi = null;
  }

  /**
   * Update manual configuration and re-scan
   */
  async updateConfig(manualDoorSensors: string[], manualMotionSensors: string[]): Promise<void> {
    this.registry.setManualConfig(manualDoorSensors, manualMotionSensors);
    await this.scanDevices();
  }

  /**
   * Get authenticated Homey API
   */
  private async getHomeyAPI(): Promise<HomeyAPI> {
    const baseUrl = await this.homey.api.getLocalUrl();
    const token = await this.homey.api.getOwnerApiToken();

    return HomeyAPI.createLocalAPI({
      address: baseUrl,
      token,
      debug: null,
    });
  }

  /**
   * Start listening for device updates
   */
  private startListening(): void {
    if (!this.devicesApi) return;

    // Create listener wrapper and store it so we can unregister it later
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.deviceUpdateListener = ((device: any, changes: any) => {
      // Very verbose debug logging
      // this.callbacks.log(`[DEBUG] device.update fired for ${device?.name || 'unknown'} (${device?.id})`);

      this.handleDeviceUpdate(device, changes).catch((error) => {
        this.callbacks.error('Error handling device update:', error);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    // Register listener
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.devicesApi as any).on('device.update', this.deviceUpdateListener);

    // Initial scan
    this.scanDevices().catch((err) => {
      this.callbacks.error('Initial scan failed:', err);
    });
  }

  /**
   * Scan for devices and set up internal state
   */
  private async scanDevices(): Promise<void> {
    if (!this.devicesApi) return;

    try {
      // Cast to our augmented type
      const allDevices = await this.devicesApi.getDevices() as unknown as Record<string, HomeyDevice>;

      const virtualDeviceResult = findVirtualDevice(allDevices, this.deviceId);

      if (!virtualDeviceResult || !virtualDeviceResult.device.zone) {
        this.callbacks.log(`Virtual sensor (${this.deviceId}) has no zone assigned, defaulting to manual config`);
        // If we found the device but it has no zone, we still store the UUID for updates
        if (virtualDeviceResult) this.registry.setVirtualSensorUuid(virtualDeviceResult.uuid);
        this.registry.useManualConfig();
      } else {
        const { device: virtualDevice, uuid } = virtualDeviceResult;

        this.registry.setVirtualSensorUuid(uuid);
        this.registry.setZone(virtualDevice.zone);

        this.callbacks.log('Virtual sensor is in zone:', virtualDevice.zone);

        const { doorSensorIds, motionSensorIds } = findSensorsInZone(allDevices, virtualDevice.zone, uuid);
        this.registry.setAutoDetectSensors(doorSensorIds, motionSensorIds);
      }

      // Update Listeners
      this.listeners.clear();

      const doors = this.registry.getAllDoorSensorIds();
      const motions = this.registry.getAllMotionSensorIds();

      doors.forEach((id) => {
        const device = allDevices[id];
        if (device) this.listeners.register(device, 'alarm_contact');
      });

      motions.forEach((id) => {
        const device = allDevices[id];
        if (device) this.listeners.register(device, 'alarm_motion');
      });

      this.callbacks.log(`Monitoring ${doors.length} doors and ${motions.length} motion sensors`);

      // Check initial states
      await this.checkInitialStates(allDevices);

    } catch (error) {
      this.callbacks.error('Failed to scan devices:', error);
    }
  }

  private async handleDoorChange(deviceId: string, isOpen: boolean): Promise<void> {
    this.callbacks.log(`Door sensor ${deviceId} changed to:`, isOpen ? 'open' : 'closed');
    if (isOpen) {
      await this.callbacks.onDoorOpened();
    } else {
      await this.checkIfAnyDoorOpen();
    }
  }

  private async handleMotionChange(deviceId: string, isMotion: boolean): Promise<void> {
    if (isMotion) {
      this.callbacks.log(`Motion detected on sensor ${deviceId}`);
      await this.callbacks.onMotionDetected(deviceId);
    }
  }

  /**
   * Check initial states of sensors
   */
  private async checkInitialStates(allDevices: Record<string, HomeyDevice>): Promise<void> {
    for (const deviceId of this.registry.getAllDoorSensorIds()) {
      const device = allDevices[deviceId];
      if (device?.capabilitiesObj?.alarm_contact?.value === true) {
        await this.callbacks.onDoorOpened();
        return;
      }
    }
  }

  /**
   * Handle device update
   */
  private async handleDeviceUpdate(device: HomeyDevice, changes?: Record<string, unknown>): Promise<void> {
    const { id, capabilitiesObj, zone } = device;

    // 1. Check if Self moved zones
    if (this.registry.shouldRescan(id, zone)) {
      this.callbacks.log(`Virtual sensor moved to new zone: ${zone}, re-scanning`);
      await this.scanDevices();
      return;
    }

    // 2. Door Sensor Update
    if (this.registry.isDoorSensor(id)) {
      if (capabilitiesObj && capabilitiesObj.alarm_contact !== undefined) {
        const isOpen = capabilitiesObj.alarm_contact.value === true;
        this.callbacks.log(`Door sensor ${id} (update) changed to:`, isOpen ? 'open' : 'closed');

        if (isOpen) {
          await this.callbacks.onDoorOpened();
        } else {
          await this.checkIfAnyDoorOpen();
        }
      }
    }

    // 3. Motion Sensor Update
    if (this.registry.isMotionSensor(id)) {
      if (capabilitiesObj && capabilitiesObj.alarm_motion !== undefined) {
        const motionDetected = capabilitiesObj.alarm_motion.value === true;
        if (motionDetected) {
          this.callbacks.log(`Motion detected on sensor ${id} (update)`);
          await this.callbacks.onMotionDetected(id);
        }
      }
    }
  }

  /**
   * Check if any monitored door is currently open
   */
  private async checkIfAnyDoorOpen(): Promise<void> {
    if (!this.devicesApi) return;
    try {
      const ids = this.registry.getAllDoorSensorIds();
      const anyOpen = await isAnyCapabilityActive(this.devicesApi, ids, 'alarm_contact');
      if (!anyOpen) {
        await this.callbacks.onDoorClosed();
      }
    } catch (error) {
      this.callbacks.error('Failed to check door states:', error);
    }
  }

  /**
   * Check if any monitored motion sensor is currently active
   */
  async isAnyMotionActive(): Promise<boolean> {
    if (!this.devicesApi) return false;
    try {
      const ids = this.registry.getAllMotionSensorIds();
      return await isAnyCapabilityActive(this.devicesApi, ids, 'alarm_motion');
    } catch (error) {
      this.callbacks.error('Failed to check motion sensor states:', error);
      return false;
    }
  }
}
