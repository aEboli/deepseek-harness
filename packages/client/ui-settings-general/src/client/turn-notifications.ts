/** Turn-completion notification preference owned by the General Settings section. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by this package's Host entry. */
export const NOTIFICATIONS_SETTINGS_NAMESPACE = 'ui-settings-general'

/** Field carrying the completed-Turn notification mode. */
export const TURN_MODE_FIELD = 'turnMode'

/** When a completed Turn raises an operating-system notification. */
export const TURN_MODES = ['unfocused', 'always', 'never'] as const

/** Completed-Turn notification mode. */
export type TurnMode = typeof TURN_MODES[number]

/** Alert on completions the user cannot see; a focused window is already its own notice. */
export const DEFAULT_TURN_MODE: TurnMode = 'unfocused'

/** Durable notification section shared by the Host schema and the browser scope. */
export interface NotificationSettings {
  /** Completed-Turn notification mode. */
  turnMode: TurnMode
  /** Whether the operating system plays the notification's own sound. */
  sound: boolean
}

/** Durable schema; also the wire envelope the browser scope validates against. */
export const NotificationSettingsFields = {
  turnMode: z.union([...TURN_MODES]).default(DEFAULT_TURN_MODE),
  sound: z.boolean().default(true),
}

/** Schema for shared configuration values. */
export const NotificationSettingsSchema = z.object(NotificationSettingsFields)
