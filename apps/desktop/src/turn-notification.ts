/** Desktop presentation of one completed turn: a system notification that returns to the app. */
import { Notification } from 'electron'

/** One completed-turn notice already attributed to its Session. */
export interface TurnNotificationOptions {
  /** Localized notification title (the product name or the Session title). */
  readonly title: string
  /** Localized notification body. */
  readonly body: string
  /** Whether the operating system plays the notification's own sound. */
  readonly sound: boolean
}

/** Narrow and localize one renderer-supplied notice before the shell presents it. */
export interface DesktopTurnNotificationOptions {
  readonly locale: () => { readonly id: 'en' | 'zh-CN' }
  /** Whether the owning window still holds the user's attention. */
  readonly focused: () => boolean
  /** Return to the application on a notification click. */
  readonly activate: () => void
  /** Native attention implementation, replaceable for platform tests. */
  readonly notice?: TurnNotificationPlatform | undefined
}

/** Native half of the notice, replaceable so tests never touch the real notification center. */
export interface TurnNotificationPlatform {
  supported(): boolean
  show(options: TurnNotificationOptions): TurnNotificationHandle
}

/** One presented native notice. */
export interface TurnNotificationHandle {
  close(): void
  /** Subscribe to a user click; the returned disposer releases the listener. */
  onClick(listener: () => void): () => void
}

/** The platform's own notification center, when the environment provides one. */
class SystemTurnNotificationPlatform implements TurnNotificationPlatform {
  /** @returns whether this environment can present a system notification. */
  supported(): boolean {
    try { return Notification.isSupported() }
    catch { return false }
  }

  /** @param options - localized copy and sound preference. @returns the presented notice. */
  show(options: TurnNotificationOptions): TurnNotificationHandle {
    const notification = new Notification({ title: options.title, body: options.body, silent: !options.sound })
    notification.show()
    return {
      close: () => { notification.removeAllListeners(); notification.close() },
      onClick: (listener) => {
        notification.once('click', listener)
        return () => { notification.removeAllListeners('click') }
      },
    }
  }
}

/** Durable copy per shipped desktop locale, owned here so the shell never borrows a dictionary. */
const MESSAGES = {
  en: { title: 'DeepSeek Harness', body: 'The reply is ready.' },
  'zh-CN': { title: 'DeepSeek Harness', body: '回复已完成。' },
} as const

/** Copy is data, not an identifier: a renderer string never reaches the native window. */
const MAX_COPY_LENGTH = 200

function acceptCopy(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > MAX_COPY_LENGTH) return fallback
  return trimmed
}

/**
 * Present one background completion notice and return to the application on click.
 * The notice is never stored: a later completion replaces whatever an earlier one left open
 * only when the platform closes it itself, and every listener is released before display ends.
 */
export class DesktopTurnNotification {
  private readonly platform: TurnNotificationPlatform
  private current: TurnNotificationHandle | undefined
  private release: (() => void) | undefined

  /** @param options - locale, focus observation, activation, and an optional test platform. */
  constructor(private readonly options: DesktopTurnNotificationOptions) {
    this.platform = options.notice ?? new SystemTurnNotificationPlatform()
  }

  /**
   * Present one notice for a completion the user could not see.
   * @param title - renderer-supplied Session label; empty values fall back to the product name.
   * @param body - renderer-supplied localization of the completion copy.
   * @param sound - whether the operating system plays the notification's own sound.
   */
  completed(title: unknown, body: unknown, sound: unknown): void {
    if (this.options.focused()) return
    try {
      if (!this.platform.supported()) return
      const fallback = MESSAGES[this.options.locale().id]
      this.clear()
      const handle = this.platform.show({
        title: acceptCopy(title, fallback.title),
        body: acceptCopy(body, fallback.body),
        sound: sound === true,
      })
      this.current = handle
      this.release = handle.onClick(() => { this.invoke(handle) })
    } catch (error) { console.warn('desktop turn notification: unavailable', error) }
  }

  /** Activate the application for a click on the notice still presented. */
  private invoke(handle: TurnNotificationHandle): void {
    if (this.current !== handle) return
    this.clear()
    this.options.activate()
  }

  /** Release the presented notice and its listener without presenting another. */
  clear(): void {
    const handle = this.current
    this.current = undefined
    const release = this.release
    this.release = undefined
    try { release?.() }
    catch (error) { console.warn('desktop turn notification: could not release listener', error) }
    try { handle?.close() }
    catch (error) { console.warn('desktop turn notification: could not close notice', error) }
  }
}