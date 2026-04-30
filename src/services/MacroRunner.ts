import type { DispatchMacro } from '../../electron/memory/schema';
import type { CrossSessionContextInjector, InjectedDecision } from './CrossSessionContextInjector';

export interface MacroContext {
  templateId: string;
  priorDecisions: InjectedDecision[];
  dispatchTarget: string;
  injectedMeetingIds: string[];
}

/**
 * Given a saved macro, pre-configure the pipeline by resolving the template,
 * injecting prior cross-session context, and returning a MacroContext.
 */
export class MacroRunner {
  constructor(private contextInjector: CrossSessionContextInjector) {}

  run(macro: DispatchMacro, _meetingId: string): MacroContext {
    const injected = this.contextInjector.inject(
      macro.project_id,
      macro.meeting_type,
      macro.prior_context_count,
    );

    return {
      templateId: macro.template_id,
      priorDecisions: injected.decisions,
      dispatchTarget: macro.dispatch_target,
      injectedMeetingIds: injected.injectedMeetingIds,
    };
  }
}
