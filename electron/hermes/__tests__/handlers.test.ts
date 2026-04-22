import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HandlerRegistry } from '../handlers'
import type { HandlerDescriptor, MeetingStartedPayload } from '../types'

describe('HandlerRegistry', () => {
  let registry: HandlerRegistry

  beforeEach(() => {
    registry = new HandlerRegistry()
  })

  it('registers and dispatches a handler', async () => {
    const fn = vi.fn()
    registry.register({
      id: 'test',
      event: 'hermes:meeting-started',
      handle: fn,
    })

    const payload: MeetingStartedPayload = {
      meetingId: '1',
      title: 'Standup',
      source: 'manual',
    }
    await registry.dispatch('hermes:meeting-started', payload)
    expect(fn).toHaveBeenCalledWith(payload)
  })

  it('dispatches to multiple handlers for the same event', async () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    registry.register({ id: 'h1', event: 'hermes:meeting-started', handle: fn1 })
    registry.register({ id: 'h2', event: 'hermes:meeting-started', handle: fn2 })

    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'Sync',
      source: 'calendar',
    })
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
  })

  it('does not dispatch to handlers of other events', async () => {
    const fn = vi.fn()
    registry.register({ id: 'h1', event: 'hermes:meeting-ended', handle: fn })

    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('unregister removes the handler', async () => {
    const fn = vi.fn()
    const unsub = registry.register({
      id: 'h1',
      event: 'hermes:meeting-started',
      handle: fn,
    })

    unsub()

    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('unregister by event + id works', async () => {
    const fn = vi.fn()
    registry.register({ id: 'h1', event: 'hermes:meeting-started', handle: fn })
    registry.unregister('hermes:meeting-started', 'h1')

    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('catches handler exceptions without propagating', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const goodFn = vi.fn()

    registry.register({
      id: 'bad',
      event: 'hermes:meeting-started',
      handle: () => { throw new Error('boom') },
    })
    registry.register({ id: 'good', event: 'hermes:meeting-started', handle: goodFn })

    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })

    // The good handler still ran despite the bad one throwing
    expect(goodFn).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Handler "bad" threw'),
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })

  it('handles async handler exceptions', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    registry.register({
      id: 'async-bad',
      event: 'hermes:meeting-started',
      handle: async () => { throw new Error('async boom') },
    })

    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Handler "async-bad" threw'),
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })

  it('getHandlers returns registered handler IDs', () => {
    registry.register({ id: 'h1', event: 'hermes:meeting-started', handle: () => {} })
    registry.register({ id: 'h2', event: 'hermes:meeting-started', handle: () => {} })

    expect(registry.getHandlers('hermes:meeting-started')).toEqual(['h1', 'h2'])
    expect(registry.getHandlers('hermes:meeting-ended')).toEqual([])
  })

  it('clear removes all handlers', async () => {
    const fn = vi.fn()
    registry.register({ id: 'h1', event: 'hermes:meeting-started', handle: fn })
    registry.clear()

    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })
    expect(fn).not.toHaveBeenCalled()
    expect(registry.getHandlers('hermes:meeting-started')).toEqual([])
  })

  it('ignores duplicate handler registration with same ID', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fn1 = vi.fn()
    const fn2 = vi.fn()

    registry.register({ id: 'dup', event: 'hermes:meeting-started', handle: fn1 })
    registry.register({ id: 'dup', event: 'hermes:meeting-started', handle: fn2 })

    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })

    // Only the first handler should have been called
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('already registered'),
    )
    warnSpy.mockRestore()
  })

  it('allows same handler ID on different events', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()

    registry.register({ id: 'shared-id', event: 'hermes:meeting-started', handle: fn1 })
    registry.register({ id: 'shared-id', event: 'hermes:meeting-ended', handle: fn2 })

    expect(registry.getHandlers('hermes:meeting-started')).toEqual(['shared-id'])
    expect(registry.getHandlers('hermes:meeting-ended')).toEqual(['shared-id'])
  })

  it('dispatch is a no-op for events with no handlers', async () => {
    // Should not throw
    await registry.dispatch('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })
  })
})
