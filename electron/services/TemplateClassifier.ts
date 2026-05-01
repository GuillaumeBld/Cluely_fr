export type TemplateId = 'standup' | 'one-on-one' | 'sales' | 'kickoff' | 'review' | 'default';

const KEYWORD_MAP: Array<{ keywords: string[]; template: TemplateId }> = [
  { keywords: ['standup', 'stand-up', 'stand up', 'daily'], template: 'standup' },
  { keywords: ['1:1', '1-1', 'one on one', 'one-on-one', 'catch up', 'catch-up'], template: 'one-on-one' },
  { keywords: ['sales', 'demo', 'bant', 'prospect', 'pitch'], template: 'sales' },
  { keywords: ['kickoff', 'kick-off', 'kick off', 'onboarding'], template: 'kickoff' },
  { keywords: ['review', 'retro', 'retrospective', 'post-mortem', 'postmortem'], template: 'review' },
];

export class TemplateClassifier {
  classify(eventTitle: string, attendeeCount: number): TemplateId {
    const lower = eventTitle.toLowerCase();
    for (const { keywords, template } of KEYWORD_MAP) {
      if (keywords.some(k => lower.includes(k))) return template;
    }
    if (attendeeCount === 2) return 'one-on-one';
    return 'default';
  }
}

export const templateClassifier = new TemplateClassifier();
