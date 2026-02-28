'use strict';

import Homey from 'homey';
import type { OccupancyState, TriggerContext } from '../../lib/types';
import { VirtualOccupancySensorDevice } from './device';

module.exports = class VirtualOccupancySensorDriver extends Homey.Driver {
  private occupancyStateChangedTrigger!: Homey.FlowCardTriggerDevice;
  private becameOccupiedTrigger!: Homey.FlowCardTriggerDevice;
  private becameEmptyTrigger!: Homey.FlowCardTriggerDevice;
  private doorOpenedTrigger!: Homey.FlowCardTriggerDevice;
  private checkingStartedTrigger!: Homey.FlowCardTriggerDevice;

  async onInit() {
    this.log('VirtualOccupancySensorDriver has been initialized');

    this.registerFlowCards();
  }

  registerFlowCards() {
    this.registerConditionCards();
    this.registerTriggerCards();
    this.registerActionCards();
  }

  registerConditionCards() {
    this.registerFlowCardIsOccupied();
    this.registerFlowCardOccupancyStateIs();
  }

  registerFlowCardIsOccupied() {
    const isOccupiedCondition = this.homey.flow.getConditionCard('is_occupied');
    isOccupiedCondition.registerRunListener(async (args) => {
      const { device } = args;
      const occupancyState = device.getCapabilityValue('occupancy_state');
      return occupancyState === 'occupied';
    });
  }

  registerFlowCardOccupancyStateIs() {
    const occupancyStateIsCondition = this.homey.flow.getConditionCard('occupancy_state_is');
    occupancyStateIsCondition.registerRunListener(async (args) => {
      const { device } = args;
      const currentState = device.getCapabilityValue('occupancy_state');
      return currentState === args.state;
    });
  }

  registerTriggerCards() {
    this.occupancyStateChangedTrigger = this.homey.flow.getDeviceTriggerCard('occupancy_state_changed');
    this.becameOccupiedTrigger = this.homey.flow.getDeviceTriggerCard('became_occupied');
    this.becameEmptyTrigger = this.homey.flow.getDeviceTriggerCard('became_empty');
    this.doorOpenedTrigger = this.homey.flow.getDeviceTriggerCard('door_opened');
    this.checkingStartedTrigger = this.homey.flow.getDeviceTriggerCard('checking_started');

    // The occupancy_state_changed trigger has a dropdown filter, so we need a run listener
    // args.state is the user-selected state from the dropdown
    // state.state is the actual state passed when triggering the card
    this.occupancyStateChangedTrigger.registerRunListener(async (args, state) => {
      return args.state === state.state;
    });
  }

  private contextToTokens(context: TriggerContext): Record<string, string | number | null> {
    return {
      triggering_device_id: context.deviceId,
      triggering_device_name: context.deviceName,
      timeout_seconds: context.timeoutSeconds,
    };
  }

  triggerOccupancyStateChanged(device: VirtualOccupancySensorDevice, state: OccupancyState, context: TriggerContext): void {
    this.occupancyStateChangedTrigger
      .trigger(device as unknown as Homey.Device, this.contextToTokens(context), { state })
      .catch(this.error);
  }

  triggerBecameOccupied(device: VirtualOccupancySensorDevice, context: TriggerContext): void {
    this.becameOccupiedTrigger
      .trigger(device as unknown as Homey.Device, this.contextToTokens(context))
      .catch(this.error);
  }

  triggerBecameEmpty(device: VirtualOccupancySensorDevice, context: TriggerContext): void {
    this.becameEmptyTrigger
      .trigger(device as unknown as Homey.Device, this.contextToTokens(context))
      .catch(this.error);
  }

  triggerDoorOpened(device: VirtualOccupancySensorDevice, context: TriggerContext): void {
    this.doorOpenedTrigger
      .trigger(device as unknown as Homey.Device, this.contextToTokens(context))
      .catch(this.error);
  }

  triggerCheckingStarted(device: VirtualOccupancySensorDevice, context: TriggerContext): void {
    this.checkingStartedTrigger
      .trigger(device as unknown as Homey.Device, this.contextToTokens(context))
      .catch(this.error);
  }

  registerActionCards() {
    this.registerDoorOpenedAction();
    this.registerDoorClosedAction();
    this.registerMotionDetectedAction();
    this.registerResetStateAction();
    this.registerSetStateAction();
  }

  registerDoorOpenedAction() {
    const doorOpenedAction = this.homey.flow.getActionCard('door_opened_action');
    doorOpenedAction.registerRunListener(async (args) => {
      const device = args.device as VirtualOccupancySensorDevice;
      device.triggerEventFromFlow('any_door_open');
      return true;
    });
  }

  registerDoorClosedAction() {
    const doorClosedAction = this.homey.flow.getActionCard('door_closed_action');
    doorClosedAction.registerRunListener(async (args) => {
      const device = args.device as VirtualOccupancySensorDevice;
      device.triggerEventFromFlow('all_doors_closed');
      return true;
    });
  }

  registerMotionDetectedAction() {
    const motionDetectedAction = this.homey.flow.getActionCard('motion_detected_action');
    motionDetectedAction.registerRunListener(async (args) => {
      const device = args.device as VirtualOccupancySensorDevice;
      device.triggerEventFromFlow('motion_detected');
      return true;
    });
  }

  registerResetStateAction() {
    const resetStateAction = this.homey.flow.getActionCard('reset_state_action');
    resetStateAction.registerRunListener(async (args) => {
      const device = args.device as VirtualOccupancySensorDevice;
      device.triggerEventFromFlow('timeout');
      return true;
    });
  }

  registerSetStateAction() {
    const setStateAction = this.homey.flow.getActionCard('set_state_action');
    setStateAction.registerRunListener(async (args) => {
      const device = args.device as VirtualOccupancySensorDevice;
      try {
        device.setStateFromFlow(args.state);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to set occupancy state: ${message}`);
      }
    });
  }

  /**
   * Lists available devices for pairing.
   * Since this this a virtual device, we'll just return "generated" device instead of actually searching for new devices.
   */
  async onPairListDevices() {
    return [
      {
        name: 'Virtual Occupancy Sensor',
        data: {
          id: `virtual-occupancy-${Date.now()}`,
        },
      },
    ];
  }
};
