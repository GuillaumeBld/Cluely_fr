import type { WorkflowDraft, Dispatcher, DispatchResult } from '../types/workflows';

export type { Dispatcher, DispatchResult };

export interface ArchonConfig {
  baseUrl: string;
}

export interface HttpClient {
  post(url: string, body: unknown): Promise<{ jobId: string }>;
}

export class ArchonDispatcher implements Dispatcher {
  constructor(private config: ArchonConfig, private httpClient: HttpClient) {}

  async dispatch(draft: WorkflowDraft): Promise<DispatchResult> {
    const url = `${this.config.baseUrl}/api/jobs`;
    const body = {
      templateId: draft.templateId,
      payload: draft.payload,
      goalTag: draft.goalTag,
      kbCitations: draft.kbCitations,
      speaker: draft.speaker, // backward-compat; prefer citation.speaker for new consumers
      citation: {
        speaker: draft.speaker,
        timestamp: draft.timestamp,
        verbatimExcerpt: draft.rawExcerpt,
      },
    };

    const result = await this.httpClient.post(url, body);
    if (!result?.jobId) {
      throw new Error('[ArchonDispatcher] Invalid response: missing jobId');
    }
    return { jobId: result.jobId };
  }
}
