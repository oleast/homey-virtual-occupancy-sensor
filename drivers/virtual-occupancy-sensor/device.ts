'use strict';

import Homey from 'homey';

type OccupancyState = 'empty' | 'occupied' | 'door_open' | 'checking';

interface HomeyDevice {
  zone?: string;
  name?: string;
  capabilitiesObj?: Record<string, { value: boolean }>;
}

module.exports = class VirtualOccupancySensorDevice extends Homey.Device {

  private checkingTimeout: NodeJS.Timeout | null = null;
  private lastDoorCloseTime: number = 0;
  private isAnyDoorOpen: boolean = false;
  private devicesApi: Homey.Api | null = null;
  private doorSensorIds: string[] = [];
  private motionSensorIds: string[] = [];
  private deviceUpdateListener: ((data: { id: string; capabilitiesObj?: Record<string, { value: boolean }>; zone?: string }) => void) | null = null;
  private currentZoneId: string | null = null;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('VirtualOccupancySensorDevice has been initialized');

    // Initialize capabilities if they don't exist
    if (!this.hasCapability('alarm_motion')) {
      await this.addCapability('alarm_motion');
    }
    if (!this.hasCapability('occupancy_state')) {
      await this.addCapability('occupancy_state');
    }

    // Set initial state
    await this.setCapabilityValue('alarm_motion', false).catch(this.error);
    await this.setCapabilityValue('occupancy_state', 'empty').catch(this.error);

    // Get the devices API
    try {
      this.devicesApi = this.homey.api.getApi('homey:manager:devices');
      await this.setupDeviceListeners();
    } catch (error) {
      this.error('Failed to setup device listeners:', error);
    }

    // Register flow card action listeners
    this.registerFlowCardActions();
  }

  /**
   * Setup listeners for door and motion sensors from the same room
   */
  async setupDeviceListeners() {
    if (!this.devicesApi) {
      return;
    }

    // Remove existing listener if any
    if (this.deviceUpdateListener) {
      this.devicesApi.off('device.update', this.deviceUpdateListener);
      this.deviceUpdateListener = null;
    }

    // Get all devices and filter by zone
    try {
      const allDevices = await this.devicesApi.get('/device');

      // Get the virtual sensor's own device info to find its zone
      const virtualSensorData = this.getData();
      const virtualSensorId = virtualSensorData.id;
      const virtualDevice = allDevices[virtualSensorId];

      if (!virtualDevice || !virtualDevice.zone) {
        this.log('Virtual sensor has no zone assigned, cannot auto-detect room sensors');
        this.currentZoneId = null;
        // Fall back to manual configuration from settings if available
        this.doorSensorIds = this.getSensorIds('door_sensors');
        this.motionSensorIds = this.getSensorIds('motion_sensors');
      } else {
        const myZoneId = virtualDevice.zone;
        this.currentZoneId = myZoneId;
        this.log('Virtual sensor is in zone:', myZoneId);

        // Reset sensor ID arrays
        this.doorSensorIds = [];
        this.motionSensorIds = [];

        // Find all devices in the same zone
        for (const [deviceId, device] of Object.entries(allDevices)) {
          // Skip self
          if (deviceId === virtualSensorId) {
            continue;
          }

          // Type assertion for device
          const deviceObj = device as HomeyDevice;

          // Check if device is in same zone
          if (deviceObj.zone === myZoneId) {
            // Check if it's a door sensor (has alarm_contact capability)
            if (deviceObj.capabilitiesObj && deviceObj.capabilitiesObj.alarm_contact) {
              this.doorSensorIds.push(deviceId);
              this.log('Found door sensor in same zone:', deviceObj.name, deviceId);
            }

            // Check if it's a motion sensor (has alarm_motion capability)
            if (deviceObj.capabilitiesObj && deviceObj.capabilitiesObj.alarm_motion) {
              this.motionSensorIds.push(deviceId);
              this.log('Found motion sensor in same zone:', deviceObj.name, deviceId);
            }
          }
        }

        this.log(`Auto-detected ${this.doorSensorIds.length} door sensors and ${this.motionSensorIds.length} motion sensors in the same room`);
      }

      // Check initial door states
      for (const deviceId of this.doorSensorIds) {
        const device = allDevices[deviceId];
        if (device && device.capabilitiesObj && device.capabilitiesObj.alarm_contact) {
          const isOpen = device.capabilitiesObj.alarm_contact.value === true;
          if (isOpen) {
            this.isAnyDoorOpen = true;
            await this.setOccupancyState('door_open');
            break;
          }
        }
      }
    } catch (error) {
      this.error('Failed to get initial device states:', error);
    }

    // Create and store listener for device capability updates
    this.deviceUpdateListener = (data: { id: string; capabilitiesObj?: Record<string, { value: boolean }>; zone?: string }) => {
      // Handle async operations without blocking
      this.handleDeviceUpdate(data).catch((error) => {
        this.error('Error handling device update:', error);
      });
    };

    this.devicesApi.on('device.update', this.deviceUpdateListener);
  }

  /**
   * Handle device update events
   */
  async handleDeviceUpdate(data: { id: string; capabilitiesObj?: Record<string, { value: boolean }>; zone?: string }) {
    const { id, capabilitiesObj, zone } = data;

    // Check if this is the virtual sensor itself and zone changed
    const virtualSensorData = this.getData();
    const virtualSensorId = virtualSensorData.id;

    if (id === virtualSensorId && zone !== undefined && zone !== this.currentZoneId) {
      this.log(`Virtual sensor moved to new zone: ${zone}, re-detecting room sensors`);
      this.currentZoneId = zone;
      await this.setupDeviceListeners();
      return;
    }

    // Check if this is a door sensor we're monitoring
    if (this.doorSensorIds.includes(id)) {
      if (capabilitiesObj && capabilitiesObj.alarm_contact !== undefined) {
        const isOpen = capabilitiesObj.alarm_contact.value === true;
        this.log(`Door sensor ${id} changed to:`, isOpen ? 'open' : 'closed');

        if (isOpen) {
          await this.handleDoorOpened();
        } else {
          // Check if any other doors are still open
          if (!this.devicesApi) {
            return;
          }
          const devices = await this.devicesApi.get('/device');
          let anyDoorOpen = false;

          for (const doorId of this.doorSensorIds) {
            const device = devices[doorId];
            if (device && device.capabilitiesObj && device.capabilitiesObj.alarm_contact) {
              if (device.capabilitiesObj.alarm_contact.value === true) {
                anyDoorOpen = true;
                break;
              }
            }
          }

          if (!anyDoorOpen) {
            await this.handleDoorClosed();
          }
        }
      }
    }

    // Check if this is a motion sensor we're monitoring
    if (this.motionSensorIds.includes(id)) {
      if (capabilitiesObj && capabilitiesObj.alarm_motion !== undefined) {
        const motionDetected = capabilitiesObj.alarm_motion.value === true;
        if (motionDetected) {
          this.log(`Motion detected on sensor ${id}`);
          await this.handleMotionDetected();
        }
      }
    }
  }

  /**
   * Get sensor IDs from settings
   */
  getSensorIds(settingKey: string): string[] {
    const setting = this.getSetting(settingKey);
    if (!setting || typeof setting !== 'string') {
      return [];
    }

    return setting
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }

  /**
   * Register flow card action listeners
   */
  registerFlowCardActions() {
    // Register action card: door_opened
    const doorOpenedAction = this.homey.flow.getActionCard('door_opened_action');
    if (doorOpenedAction) {
      doorOpenedAction.registerRunListener(async () => {
        await this.handleDoorOpened();
      });
    }

    // Register action card: door_closed
    const doorClosedAction = this.homey.flow.getActionCard('door_closed_action');
    if (doorClosedAction) {
      doorClosedAction.registerRunListener(async () => {
        await this.handleDoorClosed();
      });
    }

    // Register action card: motion_detected
    const motionDetectedAction = this.homey.flow.getActionCard('motion_detected_action');
    if (motionDetectedAction) {
      motionDetectedAction.registerRunListener(async () => {
        await this.handleMotionDetected();
      });
    }

    // Register action card: reset_state
    const resetStateAction = this.homey.flow.getActionCard('reset_state_action');
    if (resetStateAction) {
      resetStateAction.registerRunListener(async () => {
        await this.setOccupancyState('empty');
      });
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('VirtualOccupancySensorDevice settings were changed');

    // Re-setup device listeners if sensor settings changed
    if (changedKeys.includes('door_sensors') || changedKeys.includes('motion_sensors')) {
      await this.setupDeviceListeners();
    }
  }

  /**
   * Handle door opened event
   */
  async handleDoorOpened() {
    this.log('Door opened');
    this.isAnyDoorOpen = true;

    // Clear any checking timeout
    if (this.checkingTimeout) {
      this.homey.clearTimeout(this.checkingTimeout);
      this.checkingTimeout = null;
    }

    // Set state to door_open
    await this.setOccupancyState('door_open');
  }

  /**
   * Handle door closed event
   */
  async handleDoorClosed() {
    this.log('Door closed');
    this.isAnyDoorOpen = false;
    this.lastDoorCloseTime = Date.now();

    // Start checking for motion
    await this.startCheckingForMotion();
  }

  /**
   * Start checking for motion after doors close
   */
  async startCheckingForMotion() {
    this.log('Starting to check for motion');

    // Clear any existing timeout
    if (this.checkingTimeout) {
      this.homey.clearTimeout(this.checkingTimeout);
    }

    // Set state to checking
    await this.setOccupancyState('checking');

    // Get timeout from settings
    const timeoutSeconds = this.getSetting('motion_timeout') || 30;
    const timeoutMs = timeoutSeconds * 1000;

    // Set timeout to mark room as empty if no motion detected
    this.checkingTimeout = this.homey.setTimeout(async () => {
      this.log('Motion timeout - marking room as empty');
      await this.setOccupancyState('empty');
      this.checkingTimeout = null;
    }, timeoutMs);
  }

  /**
   * Handle motion detected
   */
  async handleMotionDetected() {
    const currentState = this.getCapabilityValue('occupancy_state');

    this.log('Motion detected, current state:', currentState);

    if (currentState === 'checking') {
      // Motion detected while checking - room is occupied
      // Only set to occupied if motion was detected AFTER the door closed
      const now = Date.now();
      if (now > this.lastDoorCloseTime) {
        this.log('Motion detected after door closed - room is occupied');
        await this.setOccupancyState('occupied');

        // Clear the checking timeout
        if (this.checkingTimeout) {
          this.homey.clearTimeout(this.checkingTimeout);
          this.checkingTimeout = null;
        }
      }
    } else if (currentState === 'empty') {
      // Motion detected in empty room
      this.log('Motion detected in empty room - setting to occupied');
      await this.setOccupancyState('occupied');
    }
  }

  /**
   * Set the occupancy state
   */
  async setOccupancyState(newState: OccupancyState) {
    const currentState = this.getCapabilityValue('occupancy_state');

    if (currentState === newState) {
      return; // No change
    }

    this.log(`Occupancy state changing from ${currentState} to ${newState}`);

    // Update the capability
    await this.setCapabilityValue('occupancy_state', newState).catch(this.error);

    // Update alarm_motion based on state
    const isMotion = newState === 'occupied' || newState === 'door_open';
    await this.setCapabilityValue('alarm_motion', isMotion).catch(this.error);

    // Trigger flow cards
    await this.triggerStateFlowCards(newState);
  }

  /**
   * Trigger appropriate flow cards for state change
   */
  async triggerStateFlowCards(newState: OccupancyState) {
    // Trigger general state change card
    const stateChangedTrigger = this.homey.flow.getDeviceTriggerCard('occupancy_state_changed');
    await stateChangedTrigger.trigger(this, { state: newState }).catch(this.error);

    // Trigger specific state cards
    switch (newState) {
      case 'occupied': {
        const occupiedTrigger = this.homey.flow.getDeviceTriggerCard('became_occupied');
        await occupiedTrigger.trigger(this).catch(this.error);
        break;
      }
      case 'empty': {
        const emptyTrigger = this.homey.flow.getDeviceTriggerCard('became_empty');
        await emptyTrigger.trigger(this).catch(this.error);
        break;
      }
      case 'door_open': {
        const doorOpenTrigger = this.homey.flow.getDeviceTriggerCard('door_opened');
        await doorOpenTrigger.trigger(this).catch(this.error);
        break;
      }
      case 'checking': {
        const checkingTrigger = this.homey.flow.getDeviceTriggerCard('checking_started');
        await checkingTrigger.trigger(this).catch(this.error);
        break;
      }
      default:
        // All cases covered
        break;
    }
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('VirtualOccupancySensorDevice has been deleted');

    // Clear checking timeout
    if (this.checkingTimeout) {
      this.homey.clearTimeout(this.checkingTimeout);
      this.checkingTimeout = null;
    }

    // Remove device update listener
    if (this.devicesApi && this.deviceUpdateListener) {
      this.devicesApi.off('device.update', this.deviceUpdateListener);
      this.deviceUpdateListener = null;
    }

    // Clear API reference
    this.devicesApi = null;
  }

};
