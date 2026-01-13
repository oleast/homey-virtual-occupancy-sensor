'use strict';

import Homey from 'homey';
import { OccupancyState } from '../../lib/types';
import SensorMonitor from './sensor-monitor';

module.exports = class VirtualOccupancySensorDevice extends Homey.Device {

  private checkingTimeout: NodeJS.Timeout | null = null;
  private lastDoorCloseTime: number = 0;
  private monitor: SensorMonitor | null = null;
  private eventLog: Array<{ type: 'door_open' | 'door_close' | 'motion'; timestamp: number }> = [];

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('VirtualOccupancySensorDevice has been initialized');

    // Initialize capabilities
    if (!this.hasCapability('alarm_motion')) await this.addCapability('alarm_motion');
    if (!this.hasCapability('occupancy_state')) await this.addCapability('occupancy_state');

    // Set initial state
    await this.setCapabilityValue('alarm_motion', false).catch(this.error);
    await this.setCapabilityValue('occupancy_state', 'empty').catch(this.error);

    // Initialize Sensor Monitor
    this.monitor = new SensorMonitor(this.homey, this.getData().id, {
      onDoorOpened: this.handleDoorOpened.bind(this),
      onDoorClosed: this.handleDoorClosed.bind(this),
      onMotionDetected: this.handleMotionDetected.bind(this),
      log: this.log.bind(this),
      error: this.error.bind(this),
    });

    try {
      await this.monitor.init();
      // Load initial config
      await this.updateMonitorConfig();
    } catch (error) {
      this.error('Failed to initialize monitor:', error);
    }

    this.registerFlowCardActions();
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('VirtualOccupancySensorDevice has been deleted');
    if (this.checkingTimeout) {
      this.homey.clearTimeout(this.checkingTimeout);
      this.checkingTimeout = null;
    }
    if (this.monitor) {
      this.monitor.destroy();
      this.monitor = null;
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   */
  async onSettings({ changedKeys }: { changedKeys: string[] }): Promise<void> {
    this.log('VirtualOccupancySensorDevice settings were changed');
    if (changedKeys.includes('door_sensors') || changedKeys.includes('motion_sensors')) {
      await this.updateMonitorConfig();
    }

    if (changedKeys.includes('active_on_door_open') || changedKeys.includes('active_on_checking')) {
      const currentState = this.getCapabilityValue('occupancy_state') as OccupancyState;

      let isMotion = false;
      if (currentState === 'occupied') {
        isMotion = true;
      } else if (currentState === 'door_open') {
        isMotion = this.getSetting('active_on_door_open') ?? true;
      } else if (currentState === 'checking') {
        isMotion = this.getSetting('active_on_checking') ?? false;
      }

      await this.setCapabilityValue('alarm_motion', isMotion).catch(this.error);
    }
  }

  private async updateMonitorConfig() {
    if (!this.monitor) return;
    const doorSensors = this.getSensorIds('door_sensors');
    const motionSensors = this.getSensorIds('motion_sensors');
    await this.monitor.updateConfig(doorSensors, motionSensors);
  }

  /**
   * Handle door opened event from Monitor
   */
  async handleDoorOpened() {
    this.logEvent('door_open');

    if (this.checkingTimeout) {
      this.homey.clearTimeout(this.checkingTimeout);
      this.checkingTimeout = null;
    }
    await this.setOccupancyState('door_open');
  }

  /**
   * Handle door closed event from Monitor
   */
  async handleDoorClosed() {
    this.log('Door closed');
    this.logEvent('door_close');
    this.lastDoorCloseTime = Date.now();

    await this.startCheckingForMotion();
  }

  /**
   * Start checking for motion after doors close
   */
  async startCheckingForMotion() {
    this.log('Starting to check for motion');
    if (this.checkingTimeout) this.homey.clearTimeout(this.checkingTimeout);

    await this.setOccupancyState('checking');

    const timeoutSeconds = (this.getSetting('motion_timeout') as number) || 30;
    const timeoutMs = timeoutSeconds * 1000;

    this.checkingTimeout = this.homey.setTimeout(async () => {
      // Robust check: Ensure state is still 'checking'.
      // This prevents race conditions where timeout fires after state changed to 'door_open' or 'occupied'
      // but clearTimeout failed or reference was lost.
      const currentState = this.getCapabilityValue('occupancy_state');
      if (currentState !== 'checking') {
        this.log(`Motion timeout fired but state is '${currentState}' (not 'checking'). Ignoring.`);
        return;
      }

      // Final check: Is any motion sensor CURRENTLY active?
      // Since motion sensors have their own timeout (blind time), they might still be true even if we didn't get a recent 'active' event
      // or if the event happened just before we started looking.
      if (this.monitor) {
        const isMotionActive = await this.monitor.isAnyMotionActive();
        if (isMotionActive) {
          this.log('Motion timeout - but motion sensor is still active -> occupied');
          await this.setOccupancyState('occupied');
          this.checkingTimeout = null;
          return;
        }
      }

      this.log('Motion timeout - marking room as empty');
      await this.setOccupancyState('empty');
      this.checkingTimeout = null;
    }, timeoutMs);
  }

  /**
   * Handle motion detected from Monitor
   */
  async handleMotionDetected(sensorId: string) {
    this.logEvent('motion');
    const currentState = this.getCapabilityValue('occupancy_state');
    // this.log('Motion detected, current state:', currentState); // Monitor logs this now

    if (currentState === 'checking') {
      const now = Date.now();
      if (now > this.lastDoorCloseTime) {
        this.log('Motion detected after door closed - room is occupied');
        await this.setOccupancyState('occupied');
        // Clear timeout immediately when becoming occupied
        if (this.checkingTimeout) {
          this.homey.clearTimeout(this.checkingTimeout);
          this.checkingTimeout = null;
        }
      }
    } else if (currentState === 'empty') {
      this.log('Motion detected in empty room - setting to occupied');
      await this.setOccupancyState('occupied');
    }
    // If currentState is 'door_open', we just logged it. 'handleDoorClosed' will check the log.
  }

  private logEvent(type: 'door_open' | 'door_close' | 'motion') {
    const now = Date.now();
    this.eventLog.push({ type, timestamp: now });
    // Keep logs for 5 minutes just in case
    const cutoff = now - (5 * 60 * 1000);
    if (this.eventLog[0] && this.eventLog[0].timestamp < cutoff) {
      this.eventLog = this.eventLog.filter((e) => e.timestamp > cutoff);
    }
  }

  private getLastEvent(type: 'door_open' | 'door_close' | 'motion') {
    for (let i = this.eventLog.length - 1; i >= 0; i--) {
      if (this.eventLog[i].type === type) return this.eventLog[i];
    }
    return null;
  }

  async setOccupancyState(newState: OccupancyState) {
    const currentState = this.getCapabilityValue('occupancy_state');
    if (currentState === newState) return;

    this.log(`Occupancy state changing from ${currentState} to ${newState}`);
    await this.setCapabilityValue('occupancy_state', newState).catch(this.error);

    // Determine alarm_motion based on settings
    let isMotion = false;
    if (newState === 'occupied') {
      isMotion = true;
    } else if (newState === 'door_open') {
      isMotion = this.getSetting('active_on_door_open') ?? true;
    } else if (newState === 'checking') {
      isMotion = this.getSetting('active_on_checking') ?? false;
    }

    await this.setCapabilityValue('alarm_motion', isMotion).catch(this.error);
    await this.triggerStateFlowCards(newState);
  }

  async triggerStateFlowCards(newState: OccupancyState) {
    const stateChangedTrigger = this.homey.flow.getDeviceTriggerCard('occupancy_state_changed');
    await stateChangedTrigger.trigger(this, { state: newState }).catch(this.error);

    let specificTrigger;
    switch (newState) {
      case 'occupied': specificTrigger = 'became_occupied'; break;
      case 'empty': specificTrigger = 'became_empty'; break;
      case 'door_open': specificTrigger = 'door_opened'; break;
      case 'checking': specificTrigger = 'checking_started'; break;
      default: break;
    }

    if (specificTrigger) {
      const trigger = this.homey.flow.getDeviceTriggerCard(specificTrigger);
      await trigger.trigger(this).catch(this.error);
    }
  }

  getSensorIds(settingKey: string): string[] {
    const setting = this.getSetting(settingKey);
    if (!setting || typeof setting !== 'string') return [];
    return setting.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
  }

  registerFlowCardActions() {
    this.registerAction('door_opened_action', () => this.handleDoorOpened());
    this.registerAction('door_closed_action', () => this.handleDoorClosed());
    this.registerAction('motion_detected_action', () => this.handleMotionDetected('manual_trigger'));
    this.registerAction('reset_state_action', () => this.setOccupancyState('empty'));
  }

  private registerAction(id: string, callback: () => Promise<void>) {
    const action = this.homey.flow.getActionCard(id);
    if (action) {
      action.registerRunListener(async () => {
        await callback();
      });
    }
  }

};
