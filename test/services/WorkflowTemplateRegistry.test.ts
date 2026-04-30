import { describe, it, expect } from 'vitest';
import { getAll, getById } from '../../src/services/WorkflowTemplateRegistry';

describe('WorkflowTemplateRegistry', () => {
  it('getAll returns an array of templates with required fields', () => {
    const templates = getAll();
    expect(templates.length).toBeGreaterThanOrEqual(5);

    for (const t of templates) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('embeddingSeed');
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.embeddingSeed).toBe('string');
    }
  });

  it('contains the 5 required template IDs', () => {
    const ids = getAll().map((t) => t.id);
    expect(ids).toContain('code-task');
    expect(ids).toContain('research-task');
    expect(ids).toContain('follow-up-email');
    expect(ids).toContain('meeting-schedule');
    expect(ids).toContain('document-update');
  });

  it('getById returns the correct template', () => {
    const template = getById('code-task');
    expect(template).toBeDefined();
    expect(template!.id).toBe('code-task');
    expect(template!.name).toBe('Code Task');
  });

  it('getById returns undefined for unknown ID', () => {
    expect(getById('nonexistent')).toBeUndefined();
  });
});
