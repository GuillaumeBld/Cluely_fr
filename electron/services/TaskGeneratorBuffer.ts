import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";

export class TaskGeneratorBuffer {
  private buffer: DecisionCapturedEvent[] = [];
  private handler: (e: DecisionCapturedEvent) => void;

  constructor() {
    this.handler = (e) => this.buffer.push(e);
    IpcEventBus.onTyped("decision:captured", this.handler);
  }

  flush(): DecisionCapturedEvent[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  destroy(): void {
    IpcEventBus.offTyped("decision:captured", this.handler);
    this.clear();
  }
}

export const taskGeneratorBuffer = new TaskGeneratorBuffer();
