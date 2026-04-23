import lunr from "lunr";

export interface SpeakerTurn {
  turn_id: string;
  speaker: string;
  text: string;
  timestamp: number; // ms since epoch
  meeting_id: string;
}

export class LunrIndexer {
  private turns: SpeakerTurn[] = [];
  private idx: lunr.Index | null = null;
  private dirty = true;

  addTurn(turn: SpeakerTurn): void {
    this.turns.push(turn);
    this.dirty = true;
  }

  private rebuild(): void {
    const turns = this.turns;
    this.idx = lunr(function () {
      this.ref("turn_id");
      this.field("text");
      this.field("speaker");
      turns.forEach((t) => this.add(t));
    });
    this.dirty = false;
  }

  search(query: string): SpeakerTurn[] {
    if (this.dirty) this.rebuild();
    if (!this.idx) return [];
    const results = this.idx.search(query);
    const idSet = new Set(results.map((r) => r.ref));
    return this.turns.filter((t) => idSet.has(t.turn_id));
  }

  getWindow(lastSeconds: number): SpeakerTurn[] {
    const cutoff = Date.now() - lastSeconds * 1000;
    return this.turns
      .filter((t) => t.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  clear(): void {
    this.turns = [];
    this.idx = null;
    this.dirty = true;
  }

  allTurns(): SpeakerTurn[] {
    return [...this.turns];
  }
}
