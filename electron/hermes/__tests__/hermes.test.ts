import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HermesCore } from '../index'

describe('HermesCore', () => {
  beforeEach(() => {
    HermesCore.resetInstance()
  })

  afterEach(() => {
    HermesCore.resetInstance()
  })

  it('is a singleton', () => {
    const a = HermesCore.getInstance()
    const b = HermesCore.getInstance()
    expect(a).toBe(b)
  })

  it('starts and reports isStarted', () => {
    const hermes = HermesCore.getInstance()
    expect(hermes.isStarted).toBe(false)
    hermes.start()
    expect(hermes.isStarted).toBe(true)
  })

  it('warns on duplicate start', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hermes = HermesCore.getInstance()
    hermes.start()
    hermes.start()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Already started'),
    )
    warnSpy.mockRestore()
  })

  it('emits events to registered handlers', async () => {
    const hermes = HermesCore.getInstance()
    hermes.start()

    const fn = vi.fn()
    hermes.on('hermes:meeting-started', {
      id: 'test',
      handle: fn,
    })

    await hermes.emit('hermes:meeting-started', {
      meetingId: '1',
      title: 'Sync',
      source: 'manual',
    })

    expect(fn).toHaveBeenCalledWith({
      meetingId: '1',
      title: 'Sync',
      source: 'manual',
    })
  })

  it('ignores emit before start', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hermes = HermesCore.getInstance()
    const fn = vi.fn()
    hermes.on('hermes:meeting-started', { id: 'test', handle: fn })

    await hermes.emit('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })

    expect(fn).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('before start()'),
    )
    warnSpy.mockRestore()
  })

  it('on() returns an unsubscribe function', async () => {
    const hermes = HermesCore.getInstance()
    hermes.start()

    const fn = vi.fn()
    const unsub = hermes.on('hermes:meeting-started', { id: 'test', handle: fn })
    unsub()

    await hermes.emit('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('stop clears all handlers and resets state', async () => {
    const hermes = HermesCore.getInstance()
    hermes.start()

    const fn = vi.fn()
    hermes.on('hermes:meeting-started', { id: 'test', handle: fn })
    hermes.stop()

    expect(hermes.isStarted).toBe(false)
    expect(hermes.getHandlers('hermes:meeting-started')).toEqual([])
  })

  it('resetInstance creates a fresh singleton', () => {
    const a = HermesCore.getInstance()
    a.start()
    HermesCore.resetInstance()
    const b = HermesCore.getInstance()
    expect(b).not.toBe(a)
    expect(b.isStarted).toBe(false)
  })

  it('getHandlers lists registered handler IDs', () => {
    const hermes = HermesCore.getInstance()
    hermes.on('hermes:meeting-started', { id: 'h1', handle: () => {} })
    hermes.on('hermes:meeting-started', { id: 'h2', handle: () => {} })
    expect(hermes.getHandlers('hermes:meeting-started')).toEqual(['h1', 'h2'])
  })

  it('handles multiple event types independently', async () => {
    const hermes = HermesCore.getInstance()
    hermes.start()

    const startFn = vi.fn()
    const endFn = vi.fn()
    hermes.on('hermes:meeting-started', { id: 'start', handle: startFn })
    hermes.on('hermes:meeting-ended', { id: 'end', handle: endFn })

    await hermes.emit('hermes:meeting-started', {
      meetingId: '1',
      title: 'X',
      source: 'manual',
    })

    expect(startFn).toHaveBeenCalledOnce()
    expect(endFn).not.toHaveBeenCalled()
  })
})
