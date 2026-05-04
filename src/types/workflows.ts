export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  embeddingSeed: string;
}

export interface ActionItem {
  text: string;
  speaker: string;
  timestamp: string;
  rawExcerpt: string;
}

export interface KBCitation {
  id: string;
  label: string;
  source: string;
}

export interface WorkflowDraft {
  id: string;
  templateId: string;
  confidence: number;
  payload: {
    title: string;
    description: string;
    steps: string[];
    projectId?: string;
    meetingType?: string;
  };
  kbCitations: KBCitation[];
  goalTag: string;
  rawExcerpt: string;
  speaker: string;
  timestamp: string;
}
