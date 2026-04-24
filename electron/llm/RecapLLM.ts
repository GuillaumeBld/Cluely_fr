import { LLMHelper } from "../LLMHelper";
import { UNIVERSAL_RECAP_PROMPT } from "./prompts";
import { ConflictResolution } from "../memory/schema";

export class RecapLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    /**
     * Generate a neutral conversation summary
     */
    async generate(context: string): Promise<string> {
        if (!context.trim()) return "";
        try {
            const stream = this.llmHelper.streamChat(context, undefined, undefined, UNIVERSAL_RECAP_PROMPT);
            let fullResponse = "";
            for await (const chunk of stream) fullResponse += chunk;
            return this.clampRecapResponse(fullResponse);
        } catch (error) {
            console.error("[RecapLLM] Generation failed:", error);
            return "";
        }
    }

    /**
     * Generate a neutral conversation summary (Streamed)
     */
    async *generateStream(context: string): AsyncGenerator<string> {
        if (!context.trim()) return;
        try {
            // Use our universal helper
            yield* this.llmHelper.streamChat(context, undefined, undefined, UNIVERSAL_RECAP_PROMPT);
        } catch (error) {
            console.error("[RecapLLM] Streaming generation failed:", error);
        }
    }

    private clampRecapResponse(text: string): string {
        if (!text) return "";
        // Simple clamp: max 5 lines
        return text.split('\n').filter(l => l.trim()).slice(0, 5).join('\n');
    }

    /**
     * Append a "Memory Conflicts Resolved" section to a recap summary.
     * Always present (empty section if no conflicts), per spec.
     */
    appendConflictDigest(summary: string, resolutions: ConflictResolution[]): string {
        let section = '\n\n## Memory Conflicts Resolved\n';

        if (resolutions.length === 0) {
            section += 'No memory conflicts detected.\n';
        } else {
            for (const r of resolutions) {
                const actionLabel = r.action === 'update' ? 'Updated' : r.action === 'flag' ? 'Flagged' : 'Ignored';
                section += `- **${r.fact_key}**: "${r.old_value}" → "${r.new_value}" (${actionLabel})\n`;
            }
        }

        return summary + section;
    }
}
