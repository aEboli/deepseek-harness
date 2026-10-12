// @vitest-environment jsdom
/**
 * Completed-Turn notification policy: the accepted preference, the running
 * observation, and the page focus state that together decide whether the
 * Desktop carrier sees a notice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { TurnNotificationPolicy, type DesktopTurnNoticeRequest } from '../src/client/turn-notification-policy.ts'
import type { NotificationSettings } from '../src/client/turn-notifications.ts'

type Row = { parentId?: SessionId; origin?: 'subagent'; running: boolean; displayTitle: string }

/** Session list source over a mutable row table. */
function sessions(rows: Record<string, Row>) {
  const listeners = new Set<() => void>()
  let byId: Record<string, Row> = { ...rows }
  const publish = (): void => { for (const listener of listeners) listener() }
  const source = {
    getSnapshot: () => ({
      ids: Object.keys(byId) as SessionId[],
      byId: byId as never,
      phase: 'ready' as const,
      projectionsBySession: {},
    }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  return {
    source,
    set(id: string, row: Row): void { byId = { ...byId, [id]: row }; publish() },
    drop(id: string): void {
      const next = { ...byId }
      delete next[id]
      byId = next
      publish()
    },
  }
}

/** Host settings scope scripted with one accepted section. */
function host(initial: NotificationSettings | undefined = undefined) {
  const store = createSnapshotStore<ConfigFormSnapshot<NotificationSettings>>({
    status: initial === undefined ? 'loading' : 'ready',
    value: initial, base: undefined, user: undefined, revision: initial === undefined ? undefined : 1,
    writable: true, mode: 'host',
  })
  const set = vi.fn(async () => true)
  const form: ConfigForm<NotificationSettings> = {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
    mutate: async () => true,
    set,
    unset: async () => true,
  }
  return { form, set, accept: (value: NotificationSettings | undefined) => {
    store.set({ ...store.getSnapshot(), status: 'ready', value, revision: 2 })
  } }
}

function setup(options: {
  rows?: Record<string, Row>
  initial?: NotificationSettings
  carrier?: boolean
  active?: 'zh' | 'en'
} = {}) {
  const list = sessions(options.rows ?? {})
  const settings = host(options.initial)
  const statusListeners = new Set<(id: SessionId, running: boolean) => void>()
  const ctx = { remote: { $on: (name: string, listener: (id: SessionId, running: boolean) => void) => {
    expect(name).toBe('api-session/status')
    statusListeners.add(listener)
    return () => { statusListeners.delete(listener) }
  } } } as never
  const notices: DesktopTurnNoticeRequest[] = []
  const dismiss = vi.fn()
  const policy = new TurnNotificationPolicy(settings.form, {
    ctx,
    sessions: { list: list.source } as unknown as ISessions,
    desktop: options.carrier === false ? undefined : { turnEnd: request => { notices.push(request) }, dismiss },
    copy: () => ({
      body: () => options.active === 'en' ? 'The turn is complete.' : '轮次已完成。',
      fallbackTitle: () => 'DeepSeek Harness',
    }),
  })
  return {
    policy, notices, dismiss, list, settings,
    emit: (id: string, running: boolean) => { for (const listener of statusListeners) listener(id as SessionId, running) },
    listeners: statusListeners,
  }
}

function pageVisible(visible: boolean): void {
  Object.defineProperty(document, 'visibilityState', { value: visible ? 'visible' : 'hidden', configurable: true })
}

afterEach(() => {
  pageVisible(true)
  vi.restoreAllMocks()
})

describe('TurnNotificationPolicy', () => {
  it('announces one completed Turn while the page is hidden', () => {
    pageVisible(false)
    const f = setup({ rows: { s1: { running: false, displayTitle: '审批流程' } } })
    f.emit('s1', true)
    expect(f.notices).toHaveLength(0)
    f.emit('s1', false)
    expect(f.notices).toEqual([{ sessionId: 's1', title: '审批流程', body: '轮次已完成。', sound: true }])
  })

  it('stays silent while the page is visible and when the mode is off', () => {
    const visible = setup({ rows: { s1: { running: false, displayTitle: 'Session' } } })
    visible.emit('s1', true)
    visible.emit('s1', false)
    expect(visible.notices).toHaveLength(0)

    pageVisible(false)
    const off = setup({ rows: { s1: { running: false, displayTitle: 'Session' } }, initial: { turnMode: 'never', sound: true } })
    off.emit('s1', true)
    off.emit('s1', false)
    expect(off.notices).toHaveLength(0)
  })

  it('announces in every focus state under the always mode, and honors the sound preference', () => {
    const f = setup({ rows: { s1: { running: false, displayTitle: 'Session' } }, initial: { turnMode: 'always', sound: false } })
    f.emit('s1', true)
    f.emit('s1', false)
    expect(f.notices).toHaveLength(1)
    expect(f.notices[0]!.sound).toBe(false)
  })

  it('skips addressed children and completions it never saw running', () => {
    pageVisible(false)
    const f = setup({ rows: {
      parent: { running: false, displayTitle: 'Parent' },
      child: { running: false, displayTitle: 'Child', parentId: 'parent' as SessionId },
      spawn: { running: false, displayTitle: 'Spawn', origin: 'subagent' },
    } })
    for (const id of ['parent', 'child', 'spawn', 'missing']) f.emit(id, true)
    for (const id of ['parent', 'child', 'spawn', 'missing']) f.emit(id, false)
    // A child row always names its parent or its subagent origin; a completion
    // whose row has not arrived yet keeps the product title.
    expect(f.notices.map(notice => notice.sessionId)).toEqual(['parent', 'missing'])
    expect(f.notices[0]!.title).toBe('Parent')
    expect(f.notices[1]!.title).toBe('DeepSeek Harness')
    // A completion observed without a running baseline is history, not news.
    const cold = setup({ rows: { s1: { running: false, displayTitle: 'Session' } } })
    cold.emit('s1', false)
    cold.emit('s1', false)
    expect(cold.notices).toHaveLength(0)
  })

  it('adopts a late catalog baseline without announcing it, then announces later transitions', () => {
    pageVisible(false)
    const f = setup()
    f.list.set('s1', { running: true, displayTitle: 'Session' })
    expect(f.notices).toHaveLength(0)
    f.list.set('s1', { running: false, displayTitle: 'Session' })
    expect(f.notices).toHaveLength(1)
    // A row that leaves the catalog drops its observation.
    f.list.set('s1', { running: true, displayTitle: 'Session' })
    f.list.drop('s1')
    f.list.set('s1', { running: false, displayTitle: 'Session' })
    expect(f.notices).toHaveLength(1)
  })

  it('falls back to the product title before the Session row arrives', () => {
    pageVisible(false)
    const f = setup({ active: 'en' })
    f.emit('s1', true)
    f.emit('s1', false)
    expect(f.notices).toEqual([{ sessionId: 's1', title: 'DeepSeek Harness', body: 'The turn is complete.', sound: true }])
  })

  it('presents nothing without the Desktop carrier', () => {
    pageVisible(false)
    const f = setup({ rows: { s1: { running: false, displayTitle: 'Session' } }, carrier: false })
    f.emit('s1', true)
    f.emit('s1', false)
    expect(f.notices).toHaveLength(0)
  })

  it('follows accepted Host preferences and persists one choice per preference', async () => {
    const f = setup()
    expect(f.policy.turnMode.getSnapshot()).toBe('unfocused')
    expect(f.policy.sound.getSnapshot()).toBe(true)
    f.settings.accept({ turnMode: 'always', sound: false })
    expect(f.policy.turnMode.getSnapshot()).toBe('always')
    expect(f.policy.sound.getSnapshot()).toBe(false)

    const injected = f.policy.injected()
    expect(injected.hooks.turnMode).toBe(f.policy.turnMode)
    expect(injected.hooks.notificationSound).toBe(f.policy.sound)
    await injected.setTurnMode('never')
    expect(f.settings.set).toHaveBeenCalledWith('turnMode', 'never')
    await injected.setSound(true)
    expect(f.settings.set).toHaveBeenCalledWith('sound', true)
  })

  it('restores the accepted preference when a write is refused', async () => {
    const f = setup({ initial: { turnMode: 'unfocused', sound: true } })
    const injected = f.policy.injected()
    f.settings.set.mockResolvedValue(false)
    await expect(injected.setTurnMode('always')).rejects.toThrow('Turn notification preference was not saved')
    expect(f.policy.turnMode.getSnapshot()).toBe('unfocused')
    await expect(injected.setSound(false)).rejects.toThrow('Notification sound preference was not saved')
    expect(f.policy.sound.getSnapshot()).toBe(true)
  })

  it('drops the native notice once the page is visible and releases every source on dispose', () => {
    pageVisible(false)
    const f = setup({ rows: { s1: { running: false, displayTitle: 'Session' } } })
    pageVisible(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(f.dismiss).toHaveBeenCalledOnce()
    pageVisible(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(f.dismiss).toHaveBeenCalledOnce()
    f.policy.dispose()
    f.policy.dispose()
    expect(f.listeners.size).toBe(0)
    f.emit('s1', true)
    expect(f.notices).toHaveLength(0)
  })

  it('reports a failing carrier without breaking later observations', () => {
    pageVisible(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = sessions({ s1: { running: false, displayTitle: 'Session' } })
    let fail = true
    const notices: DesktopTurnNoticeRequest[] = []
    const statusListeners = new Set<(id: SessionId, running: boolean) => void>()
    const ctx = { remote: { $on: (_name: string, listener: (id: SessionId, running: boolean) => void) => {
      statusListeners.add(listener)
      return () => { statusListeners.delete(listener) }
    } } } as never
    const policy = new TurnNotificationPolicy(host({ turnMode: 'unfocused', sound: true }).form, {
      ctx,
      sessions: { list: list.source } as unknown as ISessions,
      desktop: { turnEnd: (request) => {
        if (fail) throw new Error('notification center unavailable')
        notices.push(request)
      } },
      copy: () => ({ body: () => '轮次已完成。', fallbackTitle: () => 'DeepSeek Harness' }),
    })
    const emit = (id: string, running: boolean): void => { for (const listener of statusListeners) listener(id as SessionId, running) }
    emit('s1', true)
    emit('s1', false)
    expect(warn).toHaveBeenCalledOnce()
    fail = false
    emit('s1', true)
    emit('s1', false)
    expect(notices).toHaveLength(1)
    policy.dispose()
  })
})