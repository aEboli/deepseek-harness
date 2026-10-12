/** General Settings rows for completed-Turn notifications. */
import { useId, useState } from 'react'
import { Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { TURN_MODES, type TurnMode } from './turn-notifications.ts'
import type { TurnNotificationInjected } from './turn-notification-policy.ts'
import type { SettingsKey } from './locales.ts'
import css from './TurnNotificationsRow.module.css'

/** Dictionary key carrying the selector label of one completed-Turn mode. */
const TURN_MODE_LABELS: Readonly<Record<TurnMode, SettingsKey>> = {
  unfocused: 'notifications.turnMode.unfocused',
  always: 'notifications.turnMode.always',
  never: 'notifications.turnMode.never',
}

/** Full Settings-row props: the shared locale seat plus the injected preferences. */
export type TurnNotificationsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>
  & InjectFace<TurnNotificationInjected>

/**
 * Render the completed-Turn notification preference and its sound switch.
 * @param props - Composed Settings slot props.
 * @returns The two General Settings rows.
 */
export function TurnNotificationsRow({
  useTurnMode, useNotificationSound, setTurnMode, setSound, t,
}: TurnNotificationsRowProps) {
  const mode = useTurnMode(value => value)
  const sound = useNotificationSound(value => value)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const menuId = useId()
  return <>
    <div className={css.row}>
      <div>
        <div className={css.title}>{t('notifications.turnMode.title')}</div>
        <div className={css.description}>{t('notifications.turnMode.description')}</div>
        {failed && <div className={css.error} role="alert">{t('notifications.saveFailed')}</div>}
      </div>
      <Menu
        open={menuOpen}
        onClose={() => { setMenuOpen(false) }}
        items={TURN_MODES.map(value => ({ id: value, label: t(TURN_MODE_LABELS[value]) }))}
        selectedId={mode}
        onSelect={(id) => {
          setMenuOpen(false)
          setFailed(false)
          setBusy(true)
          void setTurnMode(id as TurnMode).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={t('notifications.turnMode.title')}
            disabled={busy}
            onClick={() => { setMenuOpen(open => !open) }}
          >
            {t(TURN_MODE_LABELS[mode])}
            <IconChevronDownOutlineRegular className={css.chevron} />
          </button>
        )}
      />
    </div>
    <div className={css.row}>
      <div>
        <div className={css.title}>{t('notifications.sound.title')}</div>
        <div className={css.description}>{t('notifications.sound.description')}</div>
      </div>
      <Switch
        checked={sound}
        disabled={busy}
        label={t('notifications.sound.title')}
        onChange={(next) => {
          setFailed(false)
          setBusy(true)
          void setSound(next).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
        }}
      />
    </div>
  </>
}