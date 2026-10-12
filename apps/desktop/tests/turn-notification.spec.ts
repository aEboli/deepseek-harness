import { describe, expect, it, vi, afterEach } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopTurnNotification } from '../src/turn-notification.ts'
import type { TurnNotificationHandle, TurnNotificationOptions } from '../src/turn-notification.ts'

/** One recorded native notice plus its scripted click wiring. */
interface Recorded {
  options: TurnNotificationOptions
  closed: boolean
  clicks: (() => void)[]
  released: number
}

/** Scripted platform: no test ever reaches a real notification center. */
function platform(options: { supported?: boolean; showFails?: boolean } = {}) {
  const notices: Recorded[] = []
  return {
    notices,
    supported: vi.fn(() => options.supported ?? true),
    show(input: TurnNotificationOptions): TurnNotificationHandle {
      if (options.showFails === true) throw new Error('notification center unavailable')
      const record: Recorded = { options: input, closed: false, clicks: [], released: 0 }
      notices.push(record)
      return {
        close: () => { record.closed = true },
        onClick: (listener) => {
          record.clicks.push(listener)
          return () => { record.released++ }
        },
      }
    },
  }
}

function setup(bridge = platform(), locale = 'zh', focused = false) {
  let focusedNow = focused
  const activate = vi.fn()
  const notification = new DesktopTurnNotification({
    locale: () => resolveDesktopLocale(locale),
    focused: () => focusedNow,
    activate,
    notice: bridge,
  })
  return {
    notification, activate, bridge,
    setFocus: (next: boolean) => { focusedNow = next },
    click: (index = 0) => { bridge.notices[index]?.clicks[0]?.() },
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe('desktop completed-turn notification', () => {
  it('presents the localized notice with the requested sound and returns to the app on click', () => {
    const f = setup()
    f.notification.completed('Session title', '本轮回复已完成。', true)
    expect(f.bridge.notices).toHaveLength(1)
    expect(f.bridge.notices[0]!.options).toEqual({ title: 'Session title', body: '本轮回复已完成。', sound: true })
    f.click()
    expect(f.activate).toHaveBeenCalledOnce()
    expect(f.bridge.notices[0]!.closed).toBe(true)
    expect(f.bridge.notices[0]!.released).toBe(1)
  })

  it('shows nothing while the window holds the attention', () => {
    const f = setup()
    f.setFocus(true)
    f.notification.completed('Session', 'body', false)
    expect(f.bridge.notices).toHaveLength(0)
  })

  it('substitutes the product copy for empty, oversized, or missing renderer strings', () => {
    const f = setup()
    f.notification.completed('', 'x'.repeat(400), 'yes')
    expect(f.bridge.notices[0]!.options).toEqual({ title: 'DeepSeek Harness', body: '回复已完成。', sound: false })
    f.notification.completed(undefined, undefined, true)
    expect(f.bridge.notices[1]!.options).toEqual({ title: 'DeepSeek Harness', body: '回复已完成。', sound: true })
  })

  it('keeps accepted copy and selects the dictionary of the active desktop locale', () => {
    const f = setup(platform(), 'en')
    f.notification.completed('  Session  ', 'Reply ready', false)
    expect(f.bridge.notices[0]!.options).toEqual({ title: 'Session', body: 'Reply ready', sound: false })
    f.notification.completed('', '', false)
    expect(f.bridge.notices[1]!.options).toEqual({ title: 'DeepSeek Harness', body: 'The reply is ready.', sound: false })
  })

  it('replaces the previous notice and keeps the retired click inert', () => {
    const f = setup()
    f.notification.completed('first', 'one', false)
    f.notification.completed('second', 'two', false)
    expect(f.bridge.notices).toHaveLength(2)
    expect(f.bridge.notices[0]!.closed).toBe(true)
    expect(f.bridge.notices[0]!.released).toBe(1)
    f.click(0)
    expect(f.activate).not.toHaveBeenCalled()
    f.click(1)
    expect(f.activate).toHaveBeenCalledOnce()
  })

  it('presents nothing when the environment cannot show notifications', () => {
    const f = setup(platform({ supported: false }))
    f.notification.completed('Session', 'body', false)
    expect(f.bridge.notices).toHaveLength(0)
  })

  it('survives a failing platform and a failing listener subscription', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing = setup(platform({ showFails: true }))
    expect(() => { failing.notification.completed('Session', 'body', false) }).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)

    // A platform that presents the notice but refuses the click subscription.
    const refusing = platform()
    const show = refusing.show.bind(refusing)
    refusing.show = (input: TurnNotificationOptions) => {
      const presented = show(input)
      return { ...presented, onClick: () => { throw new Error('listener refused') } }
    }
    const f = setup(refusing)
    expect(() => { f.notification.completed('Session', 'body', false) }).not.toThrow()
    expect(f.bridge.notices).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('keeps a native close failure from escaping and releases the listener once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bridge = platform()
    const original = bridge.show.bind(bridge)
    bridge.show = (options: TurnNotificationOptions) => {
      const handle = original(options)
      return { ...handle, close: () => { handle.close(); throw new Error('already dismissed') } }
    }
    const f = setup(bridge)
    f.notification.completed('Session', 'body', false)
    expect(() => { f.notification.clear() }).not.toThrow()
    expect(bridge.notices[0]!.closed).toBe(true)
    expect(bridge.notices[0]!.released).toBe(1)
    expect(warn).toHaveBeenCalledOnce()
    f.notification.clear()
    expect(bridge.notices[0]!.released).toBe(1)
  })

  it('frees the listener it could not detach when the notice is replaced', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bridge = platform()
    // The platform refuses to detach the click listener it accepted.
    const original = bridge.show.bind(bridge)
    bridge.show = (options: TurnNotificationOptions) => {
      const handle = original(options)
      return { ...handle, onClick: () => () => { throw new Error('listener already released') } }
    }
    const f = setup(bridge)
    // The refused detach is reported only when a notice is replaced, and it never escapes.
    expect(() => { f.notification.completed('Session', 'body', false) }).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
    f.notification.completed('Session again', 'body', false)
    expect(warn).toHaveBeenCalledOnce()
    // A retired notice cannot return to the application through its retained click closure.
    expect(() => { f.click(0) }).not.toThrow()
    expect(f.activate).not.toHaveBeenCalled()
  })
})