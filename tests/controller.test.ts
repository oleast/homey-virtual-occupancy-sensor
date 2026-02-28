import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { OccupancyState, TriggerContext } from '../lib/types';
import { VirtualOccupancySensorControllerForTest } from './virtual-occupancy-sensor-controller-for-test';

/** Helper to create a TriggerContext from a device ID */
function ctx(deviceId: string, timeoutSeconds: number | null = null): TriggerContext {
  return {
    deviceId,
    deviceName: `Test ${deviceId}`,
    timeoutSeconds,
  };
}

describe('VirtualOccupancySensorController', () => {
  let controller: VirtualOccupancySensorControllerForTest;
  let stateChanges: OccupancyState[];

  beforeEach(() => {
    stateChanges = [];

    controller = new VirtualOccupancySensorControllerForTest(
      (state: OccupancyState) => {
        stateChanges.push(state);
      },
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      () => {},
    );
  });

  function getLastState(): OccupancyState | undefined {
    return stateChanges[stateChanges.length - 1];
  }

  describe('Initial State', () => {
    it('should start in empty state', () => {
      // No state changes should have occurred yet
      expect(stateChanges).toHaveLength(0);
    });

    it('should transition to occupied on first motion event', () => {
      controller.registerEvent('motion_detected', ctx('sensor-1'));
      expect(stateChanges).toEqual(['occupied']);
    });
  });

  describe('setOccupancyState', () => {
    it('should transition to the specified state', async () => {
      await controller.setOccupancyState('occupied');
      expect(getLastState()).toBe('occupied');
    });

    it('should not trigger callback if already in that state', async () => {
      await controller.setOccupancyState('empty');
      expect(stateChanges).toHaveLength(0); // Already empty, no transition
    });

    it('should transition through multiple states', async () => {
      await controller.setOccupancyState('occupied');
      await controller.setOccupancyState('door_open');
      await controller.setOccupancyState('checking');
      await controller.setOccupancyState('empty');

      expect(stateChanges).toEqual(['occupied', 'door_open', 'checking', 'empty']);
    });
  });

  describe('State: empty', () => {
    // Controller starts in 'empty' state by default

    it('should transition to occupied on motion_detected', () => {
      controller.registerEvent('motion_detected', ctx('motion-1'));
      expect(getLastState()).toBe('occupied');
    });

    it('should transition to door_open on any_door_open', () => {
      controller.registerEvent('any_door_open', ctx('door-1'));
      expect(getLastState()).toBe('door_open');
    });

    it('should ignore all_doors_closed event', () => {
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore motion_timeout event', () => {
      controller.registerEvent('motion_timeout', ctx('motion-1'));
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore timeout event', () => {
      controller.registerEvent('timeout', ctx('system'));
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe('State: occupied', () => {
    beforeEach(async () => {
      await controller.setOccupancyState('occupied');
      stateChanges = []; // Reset to track only new transitions
    });

    it('should transition to door_open on any_door_open', () => {
      controller.registerEvent('any_door_open', ctx('door-1'));
      expect(getLastState()).toBe('door_open');
    });

    it('should ignore motion_detected event (already occupied)', () => {
      controller.registerEvent('motion_detected', ctx('motion-1'));
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore all_doors_closed event', () => {
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore motion_timeout event', () => {
      controller.registerEvent('motion_timeout', ctx('motion-1'));
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore timeout event', () => {
      controller.registerEvent('timeout', ctx('system'));
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe('State: door_open', () => {
    beforeEach(async () => {
      await controller.setOccupancyState('door_open');
      stateChanges = []; // Reset to track only new transitions
    });

    it('should transition to checking on all_doors_closed', () => {
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      expect(getLastState()).toBe('checking');
    });

    it('should ignore any_door_open event (already in door_open)', () => {
      controller.registerEvent('any_door_open', ctx('door-2'));
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore motion_detected event', () => {
      controller.registerEvent('motion_detected', ctx('motion-1'));
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore motion_timeout event', () => {
      controller.registerEvent('motion_timeout', ctx('motion-1'));
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore timeout event', () => {
      controller.registerEvent('timeout', ctx('system'));
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe('State: checking', () => {
    beforeEach(async () => {
      await controller.setOccupancyState('checking');
      stateChanges = []; // Reset to track only new transitions
    });

    it('should transition to occupied on motion_detected', () => {
      controller.registerEvent('motion_detected', ctx('motion-1'));
      expect(getLastState()).toBe('occupied');
    });

    it('should transition to door_open on any_door_open', () => {
      controller.registerEvent('any_door_open', ctx('door-1'));
      expect(getLastState()).toBe('door_open');
    });

    it('should transition to empty on timeout', () => {
      controller.registerEvent('timeout', ctx('system'));
      expect(getLastState()).toBe('empty');
    });

    it('should ignore motion_timeout event (wait for explicit timeout)', () => {
      controller.registerEvent('motion_timeout', ctx('motion-1'));
      // motion_timeout is now ignored in checking state
      // Only the CheckingSensorRegistry timeout triggers transition to empty
      expect(stateChanges).toHaveLength(0);
    });

    it('should ignore all_doors_closed event', () => {
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe('Full State Machine Flows', () => {
    it('should handle standard entry flow: empty -> door_open -> checking -> occupied', () => {
      // Start empty
      controller.registerEvent('any_door_open', ctx('door-1'));
      expect(getLastState()).toBe('door_open');

      controller.registerEvent('all_doors_closed', ctx('door-1'));
      expect(getLastState()).toBe('checking');

      controller.registerEvent('motion_detected', ctx('motion-1'));
      expect(getLastState()).toBe('occupied');

      expect(stateChanges).toEqual(['door_open', 'checking', 'occupied']);
    });

    it('should handle quick exit flow: occupied -> door_open -> checking -> empty', () => {
      controller.registerEvent('motion_detected', ctx('motion-1')); // Get to occupied
      stateChanges = [];

      controller.registerEvent('any_door_open', ctx('door-1'));
      expect(getLastState()).toBe('door_open');

      controller.registerEvent('all_doors_closed', ctx('door-1'));
      expect(getLastState()).toBe('checking');

      controller.registerEvent('timeout', ctx('system'));
      expect(getLastState()).toBe('empty');

      expect(stateChanges).toEqual(['door_open', 'checking', 'empty']);
    });

    it('should handle motion in empty room: empty -> occupied', () => {
      controller.registerEvent('motion_detected', ctx('motion-1'));
      expect(stateChanges).toEqual(['occupied']);
    });

    it('should handle door re-open during checking: checking -> door_open', async () => {
      await controller.setOccupancyState('checking');
      stateChanges = [];

      controller.registerEvent('any_door_open', ctx('door-1'));
      expect(getLastState()).toBe('door_open');

      controller.registerEvent('all_doors_closed', ctx('door-1'));
      expect(getLastState()).toBe('checking');

      expect(stateChanges).toEqual(['door_open', 'checking']);
    });

    it('should handle false entry: empty -> door_open -> checking -> empty', () => {
      controller.registerEvent('any_door_open', ctx('door-1'));
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      // In the actual implementation, the CheckingSensorRegistry sends a 'timeout' event
      controller.registerEvent('timeout', ctx('system'));

      expect(stateChanges).toEqual(['door_open', 'checking', 'empty']);
    });

    it('should handle multiple door open/close cycles', () => {
      // First cycle
      controller.registerEvent('any_door_open', ctx('door-1'));
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      // Re-open before motion
      controller.registerEvent('any_door_open', ctx('door-1'));
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      // Motion detected
      controller.registerEvent('motion_detected', ctx('motion-1'));

      expect(stateChanges).toEqual([
        'door_open',
        'checking',
        'door_open',
        'checking',
        'occupied',
      ]);
    });

    it('should stay occupied through door cycles if motion continues', async () => {
      // Get to occupied
      await controller.setOccupancyState('occupied');
      stateChanges = [];

      // Door opens and closes
      controller.registerEvent('any_door_open', ctx('door-1'));
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      // Motion detected (someone stayed)
      controller.registerEvent('motion_detected', ctx('motion-1'));

      expect(stateChanges).toEqual(['door_open', 'checking', 'occupied']);
    });
  });

  describe('Edge Cases', () => {
    it('should not transition when event does not match current state', async () => {
      // From empty, all_doors_closed should be ignored
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      controller.registerEvent('motion_timeout', ctx('motion-1'));
      controller.registerEvent('timeout', ctx('system'));

      expect(stateChanges).toHaveLength(0);
    });

    it('should handle rapid event sequences', () => {
      // Rapid door activity
      controller.registerEvent('any_door_open', ctx('door-1'));
      controller.registerEvent('any_door_open', ctx('door-2')); // Already door_open
      controller.registerEvent('all_doors_closed', ctx('door-1'));
      controller.registerEvent('all_doors_closed', ctx('door-2')); // Already checking

      expect(stateChanges).toEqual(['door_open', 'checking']);
    });

    it('should handle events from different devices correctly', () => {
      controller.registerEvent('any_door_open', ctx('front-door'));
      expect(getLastState()).toBe('door_open');

      controller.registerEvent('motion_detected', ctx('living-room-sensor'));
      // Motion is ignored in door_open state
      expect(getLastState()).toBe('door_open');

      controller.registerEvent('all_doors_closed', ctx('front-door'));
      expect(getLastState()).toBe('checking');

      controller.registerEvent('motion_detected', ctx('bedroom-sensor'));
      expect(getLastState()).toBe('occupied');
    });
  });

  describe('forceState', () => {
    it('should transition to specified state from empty', () => {
      const localStateChanges: OccupancyState[] = [];
      const localController = new VirtualOccupancySensorControllerForTest(
        (state) => localStateChanges.push(state),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
      );
      const context: TriggerContext = {
        deviceId: 'flow_action',
        deviceName: 'Flow Action',
        timeoutSeconds: null,
      };

      localController.forceState('occupied', context);
      expect(localStateChanges).toContain('occupied');
    });

    it('should allow any state transition (empty to checking)', () => {
      const localStateChanges: OccupancyState[] = [];
      const localController = new VirtualOccupancySensorControllerForTest(
        (state) => localStateChanges.push(state),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
      );
      const context: TriggerContext = {
        deviceId: 'flow_action',
        deviceName: 'Flow Action',
        timeoutSeconds: null,
      };

      // This transition is normally impossible via events
      localController.forceState('checking', context);
      expect(localStateChanges).toContain('checking');
    });

    it('should not trigger callback when forcing same state', () => {
      const localStateChanges: OccupancyState[] = [];
      const localController = new VirtualOccupancySensorControllerForTest(
        (state) => localStateChanges.push(state),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
      );
      const context: TriggerContext = {
        deviceId: 'flow_action',
        deviceName: 'Flow Action',
        timeoutSeconds: null,
      };

      // Initial state is empty, forcing to empty should be no-op
      localController.forceState('empty', context);
      expect(localStateChanges).toHaveLength(0);
    });

    it('should pass context to callback', () => {
      let capturedContext: TriggerContext | null = null;
      const localController = new VirtualOccupancySensorControllerForTest(
        (state, context) => { capturedContext = context; },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
      );
      const context: TriggerContext = {
        deviceId: 'flow_action',
        deviceName: 'Flow Action',
        timeoutSeconds: null,
      };

      localController.forceState('occupied', context);
      expect(capturedContext).toEqual(context);
    });

    it('should allow transition from any state to any other state', () => {
      const localStateChanges: OccupancyState[] = [];
      const localController = new VirtualOccupancySensorControllerForTest(
        (state) => localStateChanges.push(state),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {},
      );
      const context: TriggerContext = {
        deviceId: 'flow_action',
        deviceName: 'Flow Action',
        timeoutSeconds: null,
      };

      // Go through all states in unusual order
      localController.forceState('checking', context);
      localController.forceState('door_open', context);
      localController.forceState('empty', context);
      localController.forceState('occupied', context);

      expect(localStateChanges).toEqual(['checking', 'door_open', 'empty', 'occupied']);
    });
  });
});
