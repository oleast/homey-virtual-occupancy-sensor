import { OccupancyState } from '../../lib/types';

export type StateChangeCallback = (state: OccupancyState) => void;
export type TimerCallback = (durationMs: number) => void;
export type CancelTimerCallback = () => void;

type EventType = 'any_door_open' | 'all_doors_closed' | 'motion_detected' | 'motion_timeout' | 'timeout';

export class VirtualOccupancySensorController {
  private currentState: OccupancyState = 'empty';
  private onStateChange: StateChangeCallback;
  private log: (message: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private error: (message: string, error?: unknown) => void;

  constructor(
    onStateChange: StateChangeCallback,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    this.onStateChange = onStateChange;
    this.log = log;
    this.error = error;
  }

  public registerEvent(eventType: EventType, deviceId: string) {
    this.log(`Received event: ${eventType} from ${deviceId || 'system'}. Current state: ${this.currentState}`);

    switch (this.currentState) {
      case 'empty':
        this.handleEventInEmpty(eventType);
        break;
      case 'occupied':
        this.handleEventInOccupied(eventType);
        break;
      case 'door_open':
        this.handleEventInDoorOpen(eventType);
        break;
      case 'checking':
        this.handleEventInChecking(eventType);
        break;
      default:
        this.error(`Unknown state: ${this.currentState}`);
    }
  }

  protected transitionTo(newState: OccupancyState) {
    if (this.currentState === newState) return;
    this.log(`Transitioning from ${this.currentState} to ${newState}`);
    this.currentState = newState;
    this.onStateChange(newState);
  }

  // --- State Handlers ---

  private handleEventInEmpty(event: EventType) {
    if (event === 'motion_detected') {
      this.transitionTo('occupied');
    } else if (event === 'any_door_open') {
      this.transitionTo('door_open');
    }
  }

  private handleEventInOccupied(event: EventType) {
    if (event === 'any_door_open') {
      this.transitionTo('door_open');
    }
  }

  private handleEventInDoorOpen(event: EventType) {
    if (event === 'all_doors_closed') {
      this.transitionTo('checking');
    }
  }

  private handleEventInChecking(event: EventType) {
    if (event === 'motion_detected') {
      this.transitionTo('occupied');
    } else if (event === 'any_door_open') {
      this.transitionTo('door_open');
    } else if (event === 'timeout') {
      this.transitionTo('empty');
    }
  }
}
