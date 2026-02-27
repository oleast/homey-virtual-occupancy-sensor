export type OccupancyState = 'empty' | 'occupied' | 'door_open' | 'checking';
export type EventType = 'any_door_open' | 'all_doors_closed' | 'motion_detected' | 'motion_timeout' | 'timeout';

/* eslint-disable camelcase */
export interface DeviceSettings {
  motion_timeout: number;
  auto_learn_timeout: boolean;
  auto_detect_motion_sensors: boolean;
  auto_detect_door_sensors: boolean;
  include_child_zones_motion: boolean;
  include_child_zones_contact: boolean;
  active_on_occupied: boolean;
  active_on_empty: boolean;
  active_on_door_open: boolean;
  active_on_checking: boolean;
  door_sensors: string;
  motion_sensors: string;
}
/* eslint-enable camelcase */

/**
 * Context about what triggered a state change, used for debugging in flows.
 */
export interface TriggerContext {
  /** The ID of the device that triggered the state change */
  deviceId: string;
  /** The name of the device that triggered the state change */
  deviceName: string;
  /** The timeout value (in seconds) that was used, if applicable */
  timeoutSeconds: number | null;
}
