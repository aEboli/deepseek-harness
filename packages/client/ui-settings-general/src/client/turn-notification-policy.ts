/** Completed-Turn notification policy: Host preference, running observation, and background notice. */

import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type ObservableSnapshot, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: the ctx.remote merge that carries the Session status event.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_TURN_MODE, TURN_MODE_FIELD,
  type NotificationSettings, type TurnMode,
} from './turn-notifications.ts'

/** Native notification request the Desktop carrier accepts. */
export interface DesktopTurnNoticeRequest {
  readonly sessionId: string
  /** Localized Session label shown as the notification title. */
  readonly title: string
  /** Localized completion copy shown as the notification body. */
  readonly body: string
  /** Whether the operating system plays the notification's own sound. */
  readonly sound: boolean
}

/** Desktop carrier that presents one completed-Turn notice. */
export interface DesktopTurnNoticeCarrier {
  /** Present one notice; the shell owns focus observation and native presentation. */
  turnEnd(request: DesktopTurnNoticeRequest): Promise<void> | void
  /** Drop the presented notice once the page is visible again. */
  dismiss?(): Promise<void> | void
}

/**
 * Localized copy the policy resolves at announcement time, so a language
 * change applies to the next notice instead of the next apply.
 */
export interface TurnNotificationCopy {
  /** Notification body for one completed Turn. */
  readonly body: () => string
  /** Title used until the Session projects a label. */
  readonly fallbackTitle: () => string
}

/** Observations the policy owns. */
export interface TurnNotificationDeps {
  /** Root Client context supplying the Session status event. */
  readonly ctx: Context
  /** Controller-owned Session object layer; supplies the durable row label. */
  readonly sessions: ISessions
  /** Desktop carrier, absent on an ordinary Web page. */
  readonly desktop: DesktopTurnNoticeCarrier | undefined
  /** Resolve the notification copy for the active dictionary. */
  readonly copy: () => TurnNotificationCopy
}

/** One accepted preference pair plus the behavior it drives. */
export interface TurnNotificationInjected {
  hooks: {
    /** Completed-Turn notification mode, bound as useTurnMode. */
    turnMode: ObservableSnapshot<TurnMode>
    /** Notification sound preference, bound as useNotificationSound. */
    notificationSound: ObservableSnapshot<boolean>
  }
  /** Persist one notification mode. */
  setTurnMode(mode: TurnMode): Promise<void>
  /** Persist the notification sound preference. */
  setSound(sound: boolean): Promise<void>
}

/**
 * Whether one Session is a direct-agent conversation rather than an addressed
 * child. A row the catalog has not projected yet stays eligible: the notice
 * belongs to a completion the user asked for, while a child row always names
 * its parent or its subagent origin.
 */
function isMainConversation(sessions: ISessions, id: SessionId): boolean {
  const row = sessions.list.getSnapshot().byId[id]
  if (row === undefined) return true
  return row.parentId === undefined && row.origin !== 'subagent'
}

/**
 * Present one operating-system notice per completed Turn that the user could
 * not see. The policy owns three facts: the accepted preference, the running
 * observation for every catalogued Session, and the page's own focus state.
 * A notice is raised only on a running-to-idle transition, so reconnect
 * replays and late baselines never announce history.
 */
export class TurnNotificationPolicy {
  /** Accepted mode; starts at the client default and follows Host acceptance. */
  readonly turnMode: SnapshotStore<TurnMode> = createSnapshotStore<TurnMode>(DEFAULT_TURN_MODE)
  /** Accepted sound preference. */
  readonly sound = createSnapshotStore(true)
  private readonly running = new Map<SessionId, boolean>()
  private readonly unsubscribeHost: () => void
  private readonly disposeEvents: () => void
  private readonly disposeDocument: () => void
  private disposed = false

  /**
   * @param host - Host settings scope backing the two preferences.
   * @param deps - Session source, Desktop carrier, and localized copy.
   */
  constructor(private readonly host: ConfigForm<NotificationSettings>, private readonly deps: TurnNotificationDeps) {
    const adopt = (): void => {
      const accepted = host.getSnapshot().value
      if (accepted === undefined) return
      if (accepted.turnMode !== this.turnMode.getSnapshot()) this.turnMode.set(accepted.turnMode)
      if (accepted.sound !== this.sound.getSnapshot()) this.sound.set(accepted.sound)
    }
    this.unsubscribeHost = host.subscribe(adopt)
    adopt()
    const onStatus = (sessionId: SessionId, running: boolean): void => { this.observe(sessionId, running) }
    const offStatus = deps.ctx.remote.$on('api-session/status', onStatus)
    const onList = (): void => { this.reconcile() }
    const offList = deps.sessions.list.subscribe(onList)
    this.reconcile()
    this.disposeEvents = () => { offStatus(); offList() }
    const onVisibility = (): void => { this.dismiss() }
    document.addEventListener('visibilitychange', onVisibility)
    this.disposeDocument = () => { document.removeEventListener('visibilitychange', onVisibility) }
  }

  /** Release the preference subscription, the event sources, and the focus listener. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeHost()
    this.disposeEvents()
    this.disposeDocument()
  }

  /** Registration-side face of the two preferences. */
  injected(): TurnNotificationInjected {
    return {
      hooks: { turnMode: this.turnMode, notificationSound: this.sound },
      setTurnMode: async (mode) => {
        this.turnMode.set(mode)
        if (!await this.host.set(TURN_MODE_FIELD, mode)) {
          this.turnMode.set(this.host.getSnapshot().value?.turnMode ?? DEFAULT_TURN_MODE)
          throw new Error('Turn notification preference was not saved')
        }
      },
      setSound: async (sound) => {
        this.sound.set(sound)
        if (!await this.host.set('sound', sound)) {
          this.sound.set(this.host.getSnapshot().value?.sound ?? true)
          throw new Error('Notification sound preference was not saved')
        }
      },
    }
  }

  /** Adopt every catalogued Session's Host running state and announce completions it reveals. */
  private reconcile(): void {
    const list = this.deps.sessions.list.getSnapshot()
    for (const id of list.ids) {
      const row = list.byId[id]
      /* v8 ignore next -- the list contract pairs every ids entry with a byId row in the same snapshot */
      if (row === undefined) continue
      const previous = this.running.get(id)
      if (previous === undefined) {
        this.running.set(id, row.running)
        continue
      }
      if (previous !== row.running) this.observe(id, row.running)
    }
    for (const id of [...this.running.keys()]) {
      if (!list.ids.includes(id)) this.running.delete(id)
    }
  }

  /** Record one running observation and raise a notice for a completed Turn. */
  private observe(sessionId: SessionId, running: boolean): void {
    const previous = this.running.get(sessionId)
    this.running.set(sessionId, running)
    if (running || previous !== true) return
    this.announce(sessionId)
  }

  /** Present the notice one mode and focus state allow. */
  private announce(sessionId: SessionId): void {
    const carrier = this.deps.desktop
    if (carrier === undefined) return
    const mode = this.turnMode.getSnapshot()
    if (mode === 'never') return
    if (mode === 'unfocused' && document.visibilityState === 'visible') return
    if (!isMainConversation(this.deps.sessions, sessionId)) return
    const copy = this.deps.copy()
    const title = this.deps.sessions.list.getSnapshot().byId[sessionId]?.displayTitle ?? copy.fallbackTitle()
    try {
      void Promise.resolve(carrier.turnEnd({ sessionId, title, body: copy.body(), sound: this.sound.getSnapshot() }))
        .catch((error: unknown) => { console.warn('turn notifications: could not present the notice', String(error)) })
    } catch (error) { console.warn('turn notifications: could not present the notice', String(error)) }
  }

  /** Drop the native notice once the page is visible again; the click path lives in the shell. */
  private dismiss(): void {
    if (document.visibilityState !== 'visible') return
    try {
      void Promise.resolve(this.deps.desktop?.dismiss?.()).catch((error: unknown) => {
        console.warn('turn notifications: could not drop the notice', String(error))
      })
    } catch (error) { console.warn('turn notifications: could not drop the notice', String(error)) }
  }
}