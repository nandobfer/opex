import type { OauthStatusTone } from "@/components/ui/oauth-status-badge"
import { OPEX_MCP_OAUTH_STATUS_LABELS, type OpexMcpOauthStatus } from "../../../mcp"

/** Tom do selo de cada situação OAuth do Agente Opex. */
export const OPEX_MCP_OAUTH_TONES: Record<OpexMcpOauthStatus, OauthStatusTone> = {
    authorized: "ok",
    needs_auth: "attention",
    not_authorized: "attention",
    error: "error",
}

export const oauthBadgeOf = (status: OpexMcpOauthStatus) => ({ tone: OPEX_MCP_OAUTH_TONES[status], label: `OAuth · ${OPEX_MCP_OAUTH_STATUS_LABELS[status]}` })
