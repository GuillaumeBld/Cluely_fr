/**
 * HermesCore — In-process event orchestrator for Cluely
 *
 * Scope: Interpretation A (Inner Cluely Operator) — see ADR-001.
 * Hermes observes only data Cluely already holds.
 */

import { HandlerRegistry } from './handlers'
import type { HermesEventName, HermesHandler, HandlerDescriptor, HermesEventMap } from './types'

export class HermesCore {
  private static instance: HermesCore | null = null
  private registry = new HandlerRegistry()
  private started = false

  private constructor() {}

  static getInstance(): HermesCore {
    if (!HermesCore.instance) {
      HermesCore.instance = new HermesCore()
    }
    return HermesCore.instance
  }

  /**
   * Start Hermes. Called once during app initialization.
   */
  start(): void {
    if (this.started) {
      console.warn('[Hermes] Already started — ignoring duplicate start()')
      return
    }
    this.started = true
    console.log('[Hermes] Started (Interpretation A — Inner Cluely Operator)')
  }

  /**
   * Register a handler. Returns an unsubscribe function.
   *
   * Usage:
   * ```ts
   * const unsub = hermes.on('hermes:meeting-started', {
   *   id: 'my-feature',
   *   handle: (payload) => { ... },
   * })
   * ```
   */
  on<E extends HermesEventName>(
    event: E,
    handler: { id: string; handle: HermesHandler<E> },
  ): () => void {
    const descriptor: HandlerDescriptor<E> = {
      id: handler.id,
      event,
      handle: handler.handle,
    }
    return this.registry.register(descriptor)
  }

  /**
   * Emit an event to all registered handlers.
   * Handlers run concurrently; exceptions are caught and logged.
   */
  async emit<E extends HermesEventName>(
    event: E,
    payload: HermesEventMap[E],
  ): Promise<void> {
    if (!this.started) {
      console.warn(`[Hermes] emit("${event}") called before start() — ignoring`)
      return
    }
    await this.registry.dispatch(event, payload)
  }

  /**
   * Stop Hermes and remove all handlers.
   */
  stop(): void {
    this.registry.clear()
    this.started = false
    console.log('[Hermes] Stopped')
  }

  /**
   * Reset singleton (for testing only).
   */
  static resetInstance(): void {
    if (HermesCore.instance) {
      HermesCore.instance.stop()
    }
    HermesCore.instance = null
  }

  get isStarted(): boolean {
    return this.started
  }

  /**
   * List handler IDs registered for a given event (for debugging).
   */
  getHandlers(event: HermesEventName): string[] {
    return this.registry.getHandlers(event)
  }
}

// Re-export types for convenience
export type { HermesEventName, HermesEventMap, HermesHandler, HandlerDescriptor } from './types'
