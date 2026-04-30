import type { WorkflowTemplate } from '../types/workflows';
import templates from '../data/workflowTemplates.json';

const registry: WorkflowTemplate[] = templates;

export function getAll(): WorkflowTemplate[] {
  return registry;
}

export function getById(id: string): WorkflowTemplate | undefined {
  return registry.find((t) => t.id === id);
}
