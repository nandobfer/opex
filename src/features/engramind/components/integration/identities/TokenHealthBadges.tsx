"use client"

import { TOKEN_ALERT_LABELS, tokenHealth } from "../../../identities"
import type { EngramindAgent, EngramindApp, EngramindToken } from "../../../types"
import { HelpBadge } from "../../shared/Badges"

/** Alertas de saúde do token (expirando, sem uso, dono desativado), no padrão dos selos da aba. */
export function TokenHealthBadges({ token, apps, agents }: { token: EngramindToken; apps: readonly EngramindApp[]; agents: readonly EngramindAgent[] }) {
    const alerts = tokenHealth(token, { apps, agents })
    return (
        <>
            {alerts.map((alert) => (
                <HelpBadge key={alert} value={alert === "expiring" ? "expira logo" : alert === "idle" ? "sem uso" : "dono desativado"} tone="warning" help={TOKEN_ALERT_LABELS[alert]} />
            ))}
        </>
    )
}
