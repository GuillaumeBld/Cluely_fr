import axios from 'axios';
import type { WorkflowDraft } from '../../src/types/workflows';
import type { ExportWebhook } from './CredentialsManager';
import { CredentialsManager } from './CredentialsManager';
import type { WebhookEmitter } from '../../src/ipc/approvalHandlers';

export class CredentialsWebhookEmitter implements WebhookEmitter {
    async emit(draft: WorkflowDraft, jobId: string): Promise<void> {
        const webhooks: ExportWebhook[] = CredentialsManager.getInstance().getExportWebhooks();
        if (webhooks.length === 0) return;

        const payload = {
            jobId,
            approvedAt: new Date().toISOString(),
            draft,
        };

        await Promise.allSettled(
            webhooks.map((webhook) =>
                axios
                    .post(webhook.url, payload, { timeout: 5000 })
                    .then(() => {
                        console.log(`[WebhookEmitter] Posted to '${webhook.name}'`);
                    })
                    .catch((err: Error) => {
                        console.error(`[WebhookEmitter] Failed to post to '${webhook.name}' (${webhook.url}):`, err.message);
                    })
            )
        );
    }
}
