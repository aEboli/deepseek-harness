# Desktop turn-completion notifications (DSH Desktop)

This branch adds one operating-system notification per finished Turn to DSH
Desktop, together with the two settings rows that own the preference. It is
meant for review against `deepseek-ai/deepseek-harness`; the official repository
is not accepting external pull requests, so the reviewable diff lives here.

* Reviewable PR (branch `docs/desktop-turn-notifications`): this pull request.
* Implementation branch: `feat/desktop-turn-notifications`.
* Changeset: 21 files, +1205 lines.

## 作用 / What it does

* Every time a Turn finishes while the conversation window does not have focus,
  the shell shows one native notification. Clicking it brings the window back.
* **Settings → General** gains two rows, placed with the other appearance
  preferences and above the version row:
  * **轮次完成通知 / Turn completion notifications** — 仅在未聚焦时 / Only when
    unfocused (default), 始终 / Always, 从不 / Never.
  * **通知提示音 / Notification sound** — whether the operating system plays the
    notification's own sound (on by default).
* Both fields persist as `ui-settings-general.turnMode` and
  `ui-settings-general.sound` in the Host user-settings document, so the Desktop
  shell and a loopback browser share one choice. An ordinary Web page reads the
  preference but raises no notice.
* Only direct-agent Sessions announce. Addressed children and subagent rows stay
  silent, and reconnects never replay history: a notice needs a
  running-to-idle transition observed live.
* Notification permission denied at the operating-system level leaves execution
  and the page unchanged.

## Where the code lives

| Area | Files |
| --- | --- |
| Preference schema (Host + browser) | `packages/client/ui-settings-general/src/client/turn-notifications.ts`, `src/index.ts` |
| Running observation and notification decision | `packages/client/ui-settings-general/src/client/turn-notification-policy.ts` |
| General Settings rows | `TurnNotificationsRow.tsx`, `TurnNotificationsRow.module.css`, `src/client/locales.ts`, `src/client/index.ts` |
| Native presentation | `apps/desktop/src/turn-notification.ts`, `ipc.ts`, `main.ts`, `preload-app.ts` |
| Tests | `apps/desktop/tests/turn-notification.spec.ts`, `packages/client/ui-settings-general/tests/turn-notification-policy.client.spec.ts`, `turn-notifications-row.client.spec.tsx`, `apps/web/tests/turn-notification-settings.e2e.ts` |

## 验证 / Verification

* `pnpm run typecheck` — clean (host, client, and the desktop bundle).
* `pnpm exec vitest run packages/client/ui-settings-general/tests/ packages/client/ui-settings/tests apps/desktop/tests/turn-notification.spec.ts`
  — 168 tests pass.
* `pnpm run verify-client-ui-i18n`, `verify-md-wrap`, `verify-md-links`,
  `verify-translation-pairing` — all clean.
* `apps/web/tests/turn-notification-settings.e2e.ts` covers the rendered rows
  and the Host round trip in the browser lane. It did not run inside the
  checkout used for this work, because that workspace's `build:lib:client` step
  already failed in `apps/web` on missing test-support project references
  before the change.

## 试用 / Trying it in the installed app

The installed DSH Desktop runs its Host and client from the packaged
`app.asar`, so the rows appear after an upstream merge and the next Desktop
release. To exercise the change before then, build the workspace from this
branch (`pnpm install && pnpm run build`) and start the shell from source
(`pnpm run start:desktop`).
