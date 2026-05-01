import { describe, it, expect, afterEach } from 'vitest';
import { TaskGeneratorBuffer } from '../../electron/services/TaskGeneratorBuffer';
import { IpcEventBus, DecisionCapturedEvent } from '../../electron/services/IpcEventBus';

/**
 * Tests the buildDecisionHintsBlock formatting logic from IntelligenceManager.
 * Extracted here as a pure function to verify format, flush/clear ordering,
 * and edge cases without requiring full IntelligenceManager instantiation.
 */
function buildDecisionHintsBlock(hints: DecisionCapturedEvent[]): string {
  if (hints.length === 0) return '';
  const lines = hints
    .map(
      (h) =>
        `- [${h.type}] ${h.speaker} @ ${new Date(h.timestamp).toISOString()}: "${h.text_excerpt}" (confidence: ${h.confidence})`
    )
    .join('\n');
  return `\n\n## Pre-annotated decision hints\nThe following commitments were detected mid-call. Use them to improve action item extraction:\n${lines}\n`;
}

describe('buildDecisionHintsBlock', () => {
  let buffer: TaskGeneratorBuffer;

  afterEach(() => {
    buffer?.destroy();
  });

  it('returns empty string when no decisions captured', () => {
    buffer = new TaskGeneratorBuffer();
    expect(buildDecisionHintsBlock(buffer.flush())).toBe('');
  });

  it('formats decision hints correctly', () => {
    buffer = new TaskGeneratorBuffer();
    const ts = new Date('2026-04-24T10:00:00Z').getTime();

    IpcEventBus.emitTyped('decision:captured', {
      type: 'commitment',
      speaker: 'Alice',
      timestamp: ts,
      text_excerpt: "I'll handle the migration",
      confidence: 0.7,
      meeting_id: 'm1',
      turn_id: 't1',
    });

    const block = buildDecisionHintsBlock(buffer.flush());
    expect(block).toContain('## Pre-annotated decision hints');
    expect(block).toContain('[commitment] Alice');
    expect(block).toContain("I'll handle the migration");
    expect(block).toContain('confidence: 0.7');
  });

  it('flush then clear preserves data ordering', () => {
    buffer = new TaskGeneratorBuffer();

    IpcEventBus.emitTyped('decision:captured', {
      type: 'ownership',
      speaker: 'Bob',
      timestamp: Date.now(),
      text_excerpt: 'test',
      confidence: 0.8,
      meeting_id: 'm1',
      turn_id: 't1',
    });

    const flushed = buffer.flush();
    buffer.clear();

    expect(flushed).toHaveLength(1);
    expect(buffer.flush()).toHaveLength(0);
  });

  it('formats multiple decisions in order', () => {
    buffer = new TaskGeneratorBuffer();
    const ts = Date.now();

    IpcEventBus.emitTyped('decision:captured', {
      type: 'commitment',
      speaker: 'Alice',
      timestamp: ts,
      text_excerpt: 'first decision',
      confidence: 0.7,
      meeting_id: 'm1',
      turn_id: 't1',
    });

    IpcEventBus.emitTyped('decision:captured', {
      type: 'deadline',
      speaker: 'Bob',
      timestamp: ts + 1000,
      text_excerpt: 'second decision',
      confidence: 0.8,
      meeting_id: 'm1',
      turn_id: 't2',
    });

    const block = buildDecisionHintsBlock(buffer.flush());
    const aliceIdx = block.indexOf('[commitment] Alice');
    const bobIdx = block.indexOf('[deadline] Bob');
    expect(aliceIdx).toBeLessThan(bobIdx);
  });
});
