// @vitest-environment jsdom
/** Completed-Turn notification rows: localized mode selector and sound switch. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { TurnNotificationsRow } from '../src/client/TurnNotificationsRow.tsx'
import { en, zh } from '../src/client/locales.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const unusedHook = (() => { throw new Error('unused by the notification rows') }) as never
const kit = {
  useSessions: unusedHook, useSessionStatus: unusedHook, usePanelInfo, useSessionRetainInfo: () => undefined,
  useResource, useWorkspaces: unusedHook,
}

function mount(options: { locale?: 'en' | 'zh'; refuse?: 'mode' | 'sound' } = {}) {
  const dictionary = options.locale === 'en' ? en : zh
  const mode = createSnapshotStore<'unfocused' | 'always' | 'never'>('unfocused')
  const sound = createSnapshotStore(true)
  const setTurnMode = vi.fn(async (next: 'unfocused' | 'always' | 'never') => {
    if (options.refuse === 'mode') throw new Error('refused')
    mode.set(next)
  })
  const setSound = vi.fn(async (next: boolean) => {
    if (options.refuse === 'sound') throw new Error('refused')
    sound.set(next)
  })
  const view = render(<TurnNotificationsRow {...kit}
    t={key => (dictionary as Record<string, string>)[key] ?? key}
    useTurnMode={bindSnapshotSelector(mode)}
    useNotificationSound={bindSnapshotSelector(sound)}
    setTurnMode={setTurnMode}
    setSound={setSound} />)
  return { view, mode, sound, setTurnMode, setSound, dictionary }
}

afterEach(() => { cleanup() })

describe('TurnNotificationsRow', () => {
  it('selects a notification mode from the localized menu', async () => {
    const f = mount()
    const selector = screen.getByRole('button', { name: '轮次完成通知' })
    expect(selector.textContent).toContain('仅在未聚焦时')
    fireEvent.click(selector)
    expect(screen.getByRole('menuitem', { name: '始终' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: '从不' }))
    expect(f.setTurnMode).toHaveBeenCalledWith('never')
    await waitFor(() => { expect(screen.getByRole('button', { name: '轮次完成通知' }).textContent).toContain('从不') })
  })

  it('renders the English dictionary and the currently accepted mode', () => {
    const f = mount({ locale: 'en' })
    f.mode.set('always')
    f.view.rerender(<TurnNotificationsRow {...kit}
      t={key => (en as Record<string, string>)[key] ?? key}
      useTurnMode={bindSnapshotSelector(f.mode)}
      useNotificationSound={bindSnapshotSelector(f.sound)}
      setTurnMode={f.setTurnMode}
      setSound={f.setSound} />)
    expect(screen.getByRole('button', { name: 'Turn completion notifications' }).textContent).toContain('Always')
    expect(screen.getByText('Notification sound')).toBeTruthy()
  })

  it('toggles the notification sound preference', async () => {
    const f = mount()
    const toggle = screen.getByRole('switch', { name: '通知提示音' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(f.setSound).toHaveBeenCalledWith(false)
    await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('false') })
  })

  it('reports a refused mode write and clears it on the next attempt', async () => {
    const mode = mount({ refuse: 'mode' })
    fireEvent.click(screen.getByRole('button', { name: '轮次完成通知' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '始终' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('保存失败，请重试') })
    mode.setTurnMode.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('button', { name: '轮次完成通知' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '从不' }))
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
  })

  it('reports a refused sound write', async () => {
    mount({ refuse: 'sound' })
    fireEvent.click(screen.getByRole('switch', { name: '通知提示音' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('保存失败，请重试') })
  })
})
