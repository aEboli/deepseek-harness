/** Welcome acknowledgement stored in the plugin configuration. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile, Context } from '@deepseek-ai/cordis'

import z from '@deepseek-ai/schemastery'

export type { NotificationSettings, TurnMode } from './client/turn-notifications.ts'
export { DEFAULT_TURN_MODE, NOTIFICATIONS_SETTINGS_NAMESPACE, TURN_MODES } from './client/turn-notifications.ts'
import type { NotificationSettings } from './client/turn-notifications.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Last acknowledged welcome notice version. */
  welcomeNoticeVersion: Volatile<string | undefined>
  /** Completed-Turn notification mode: background-only, always, or off. */
  turnMode: Volatile<NotificationSettings['turnMode']>
  /** Whether the operating system plays the notification's own sound. */
  sound: Volatile<boolean>
}

/** Live welcome and completed-Turn notification preferences. */
export const Config = z.object({
  welcomeNoticeVersion: z.string().volatile(),
  turnMode: z.union(['unfocused', 'always', 'never']).default('unfocused').volatile(),
  sound: z.boolean().default(true).volatile(),
})

/** The browser consumes the configuration form projection.
 * @param ctx Plugin context used for optional settings presentation.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
