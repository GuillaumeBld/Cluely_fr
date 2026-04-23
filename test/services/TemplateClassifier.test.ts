import { describe, it, expect } from 'vitest';
import { TemplateClassifier } from '../../electron/services/TemplateClassifier';

describe('TemplateClassifier', () => {
  const classifier = new TemplateClassifier();

  const fixtures: Array<{ title: string; attendees: number; expected: string }> = [
    { title: 'daily standup', attendees: 5, expected: 'standup' },
    { title: '1:1 with alice', attendees: 2, expected: 'one-on-one' },
    { title: 'sales call - acme', attendees: 3, expected: 'sales' },
    { title: 'project kickoff', attendees: 8, expected: 'kickoff' },
    { title: 'sprint review', attendees: 6, expected: 'review' },
    { title: 'unknown foo', attendees: 4, expected: 'default' },
  ];

  fixtures.forEach(({ title, attendees, expected }) => {
    it(`classifies "${title}" as "${expected}"`, () => {
      expect(classifier.classify(title, attendees)).toBe(expected);
    });
  });

  it('falls back to one-on-one when attendeeCount is 2 and no keyword match', () => {
    expect(classifier.classify('random meeting', 2)).toBe('one-on-one');
  });
});
