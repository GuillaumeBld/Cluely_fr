import { EmailManager, EmailMessage } from './EmailManager';
import { MemoryManager } from '../memory/MemoryManager';

export interface AttendeeProfile {
  email: string;
  recentEmails: EmailMessage[];
  /** Open action items from the memory graph (`works_on` edges). Empty if no graph entry exists. */
  openItems: string[];
  /** Prior decisions from the memory graph (`decided`/`discussed` edges). Empty if no graph entry exists. */
  priorDecisions: string[];
}

export class AttendeeProfiler {
  private emailManager: EmailManager;

  constructor(emailManager: EmailManager) {
    this.emailManager = emailManager;
  }

  async profile(attendeeEmails: string[]): Promise<AttendeeProfile[]> {
    if (!attendeeEmails.length) return [];
    let emailMap: Map<string, EmailMessage[]>;
    try {
      emailMap = await this.emailManager.getMessagesFromSenders(attendeeEmails);
    } catch (err) {
      console.warn('[AttendeeProfiler] Email fetch failed, proceeding without email context:', err);
      emailMap = new Map();
    }
    return attendeeEmails.map(email => {
      let openItems: string[] = [];
      let priorDecisions: string[] = [];

      try {
        const mm = MemoryManager.getInstance();
        const nodes = mm.findNodes('person', email);
        if (nodes.length > 0) {
          const node = nodes[0];
          const edges = mm.getEdgesFrom(node.id);
          for (const edge of edges) {
            const target = mm.getNode(edge.target_id);
            if (!target) continue;
            if (edge.predicate === 'works_on') {
              openItems.push(target.label);
            } else if (edge.predicate === 'decided' || edge.predicate === 'discussed') {
              priorDecisions.push(target.label.slice(0, 120));
            }
          }
        }
      } catch (err) {
        console.warn('[AttendeeProfiler] Memory graph enrichment skipped:', err);
      }

      return {
        email,
        recentEmails: emailMap.get(email) ?? [],
        openItems,
        priorDecisions,
      };
    });
  }
}
