import { EventType, OccupancyState, TriggerContext } from '../../lib/types';

export type StateChangeCallback = (state: OccupancyState, context: TriggerContext) => void;
export type TimerCallback = (durationMs: number) => void;
export type CancelTimerCallback = () => void;

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

  public registerEvent(eventType: EventType, context: TriggerContext) {
    this.log(`Received event: ${eventType} from ${context.deviceName} (${context.deviceId}). Current state: ${this.currentState}`);

    switch (this.currentState) {
      case 'empty':
        this.handleEventInEmpty(eventType, context);
        break;
      case 'occupied':
        this.handleEventInOccupied(eventType, context);
        break;
      case 'door_open':
        this.handleEventInDoorOpen(eventType, context);
        break;
      case 'checking':
        this.handleEventInChecking(eventType, context);
        break;
      default:
        this.error(`Unknown state: ${this.currentState}`);
    }
  }

  protected transitionTo(newState: OccupancyState, context: TriggerContext) {
    if (this.currentState === newState) return;
    this.log(`Transitioning from ${this.currentState} to ${newState}`);
    this.currentState = newState;
    this.onStateChange(newState, context);
  }

  // --- State Handlers ---

  private handleEventInEmpty(event: EventType, context: TriggerContext) {
    if (event === 'motion_detected') {
      this.transitionTo('occupied', context);
    } else if (event === 'any_door_open') {
      this.transitionTo('door_open', context);
    }
  }

  private handleEventInOccupied(event: EventType, context: TriggerContext) {
    if (event === 'any_door_open') {
      this.transitionTo('door_open', context);
    }
  }

  private handleEventInDoorOpen(event: EventType, context: TriggerContext) {
    if (event === 'all_doors_closed') {
      this.transitionTo('checking', context);
    }
  }

  private handleEventInChecking(event: EventType, context: TriggerContext) {
    if (event === 'motion_detected') {
      this.transitionTo('occupied', context);
    } else if (event === 'any_door_open') {
      this.transitionTo('door_open', context);
    } else if (event === 'timeout') {
      this.transitionTo('empty', context);
    }
  }
}
