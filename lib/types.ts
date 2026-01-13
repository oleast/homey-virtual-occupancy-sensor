import { HomeyAPIV3Local } from 'homey-api';

export type OccupancyState = 'empty' | 'occupied' | 'door_open' | 'checking';

export interface CapabilityInstance {
  destroy(): void;
}

export type ManagerDevicesWithConnect = HomeyAPIV3Local.ManagerDevices & {
  connect(): Promise<void>;
};

export interface MonitorCallbacks {
  onDoorOpened: () => Promise<void>;
  onDoorClosed: () => Promise<void>;
  onMotionDetected: (sensorId: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: (message: string, ...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (message: string, ...args: any[]) => void;
}
