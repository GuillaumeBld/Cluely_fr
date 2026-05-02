import { EventEmitter } from "events";

export interface DecisionCapturedEvent {
  type: "ownership" | "commitment" | "deadline" | "unresolved";
  speaker: string;
  timestamp: number; // ms since epoch
  text_excerpt: string;
  confidence: number; // 0-1
  meeting_id: string;
  turn_id: string;
}

export interface TokenAnomalyEvent {
  meeting_id: string;
  token_count: number;
  rolling_avg: number;
  threshold_multiple: number;
  timestamp: number;
}

export interface LiveNoteSnapshot {
  meeting_id: string;
  timestamp: number; // ms since epoch
  action_items: Array<{ speaker: string; text: string }>;
  decisions: Array<{ speaker: string; text: string }>;
  turn_count: number;
}

type BusEvents = {
  "decision:captured": DecisionCapturedEvent;
  "notes:updated": LiveNoteSnapshot;
  "meeting:started": { meeting_id: string };
  "meeting:ended": { meeting_id: string };
  "token:anomaly": TokenAnomalyEvent;
  "kb:updated": { summary: string; timestamp: number };
  "cost:budget-exceeded": {
    meeting_id: string | null;
    daily_cents: number;
    budget_cents: number;
    timestamp: number;
  };
};

class IpcEventBusClass extends EventEmitter {
  private static instance: IpcEventBusClass;
  static getInstance(): IpcEventBusClass {
    if (!this.instance) this.instance = new IpcEventBusClass();
    return this.instance;
  }
  /** Emit with per-listener isolation — one failing handler must not break others. Always use onTyped/offTyped, never .once(). */
  emitTyped<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    const listeners = this.listeners(event);
    for (const listener of listeners) {
      try {
        (listener as (p: BusEvents[K]) => void)(payload);
      } catch (err) {
        console.warn(`[IpcEventBus] Listener error on "${event}":`, err);
      }
    }
  }
  onTyped<K extends keyof BusEvents>(event: K, handler: (payload: BusEvents[K]) => void): void {
    this.on(event, handler as (...args: any[]) => void);
  }
  offTyped<K extends keyof BusEvents>(event: K, handler: (payload: BusEvents[K]) => void): void {
    this.off(event, handler as (...args: any[]) => void);
  }
}

export const IpcEventBus = IpcEventBusClass.getInstance();
