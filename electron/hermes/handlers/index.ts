/**
 * Hermes Handler Registry
 *
 * Manages typed handler subscriptions and dispatches events to them.
 * Handler exceptions are caught and logged — they never propagate to the emitter.
 */

import type { HermesEventName, HermesHandler, HandlerDescriptor } from '../types'

export class HandlerRegistry {
  private handlers = new Map<HermesEventName, HandlerDescriptor[]>()

  /**
   * Register a handler for a specific event.
   * Returns an unsubscribe function.
   */
  register<E extends HermesEventName>(descriptor: HandlerDescriptor<E>): () => void {
    const list = this.handlers.get(descriptor.event) ?? []
    if (list.some((h) => h.id === descriptor.id)) {
      console.warn(`[Hermes] Handler "${descriptor.id}" already registered for "${descriptor.event}" — ignoring duplicate`)
      return () => { this.unregister(descriptor.event, descriptor.id) }
    }
    // Safe: the generic constraint ensures E matches, but the map stores heterogeneous entries
    list.push(descriptor as unknown as HandlerDescriptor)
    this.handlers.set(descriptor.event, list)

    return () => {
      this.unregister(descriptor.event, descriptor.id)
    }
  }

  /**
   * Remove a handler by event + id.
   */
  unregister(event: HermesEventName, handlerId: string): void {
    const list = this.handlers.get(event)
    if (!list) return
    const filtered = list.filter((h) => h.id !== handlerId)
    if (filtered.length === 0) {
      this.handlers.delete(event)
    } else {
      this.handlers.set(event, filtered)
    }
  }

  /**
   * Dispatch an event payload to all registered handlers.
   * Each handler runs independently — exceptions are caught and logged.
   */
  async dispatch<E extends HermesEventName>(
    event: E,
    payload: Parameters<HermesHandler<E>>[0],
  ): Promise<void> {
    const list = this.handlers.get(event)
    if (!list || list.length === 0) return

    await Promise.allSettled(
      list.map(async (descriptor) => {
        try {
          await descriptor.handle(payload)
        } catch (err) {
          console.error(
            `[Hermes] Handler "${descriptor.id}" threw on "${event}":`,
            err,
          )
        }
      }),
    )
  }

  /**
   * Return all handler IDs registered for a given event.
   */
  getHandlers(event: HermesEventName): string[] {
    return (this.handlers.get(event) ?? []).map((h) => h.id)
  }

  /**
   * Remove all handlers.
   */
  clear(): void {
    this.handlers.clear()
  }
}
