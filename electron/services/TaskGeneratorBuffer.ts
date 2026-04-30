import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";

export class TaskGeneratorBuffer {
  private buffer: DecisionCapturedEvent[] = [];
  private handler: (e: DecisionCapturedEvent) => void;

  constructor() {
    this.handler = (e) => this.buffer.push(e);
    IpcEventBus.onTyped("decision:captured", this.handler);
  }

  flush(): DecisionCapturedEvent[] {
    const copy = [...this.buffer];
    this.buffer = [];
    return copy;
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
