import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectResolver } from '../../electron/services/ProjectResolver';

describe('ProjectResolver', () => {
  let resolver: ProjectResolver;

  beforeEach(() => {
    resolver = new ProjectResolver();
    resolver.configure([
      { id: 'finbiz', keywords: ['finbiz', 'finance'] },
      { id: 'cluely', keywords: ['cluely', 'clue.ly'] },
    ]);
  });

  it('resolves matching project by title keyword', () => {
    const result = resolver.resolve({ title: 'Finbiz weekly sync', attendees: [] });
    expect(result).toEqual({ projectId: 'finbiz', confidence: 1 });
  });

  it('resolves matching project by attendee email keyword', () => {
    const result = resolver.resolve({ title: 'Weekly sync', attendees: ['alice@cluely.com'] });
    expect(result).toEqual({ projectId: 'cluely', confidence: 1 });
  });

  it('returns null projectId for unknown title', () => {
    const result = resolver.resolve({ title: 'random chat', attendees: [] });
    expect(result).toEqual({ projectId: null, confidence: 0 });
  });
});
