/**
 * Regras de autorização dos canais privados do Pusher.
 *
 * Só canais CONHECIDOS são autorizados, e o **tipo de sessão** decide quem vê o quê:
 * - `private-app` e `private-integration-{id}`: apenas o **dono** (`kind: "admin"`) — o usuário de
 *   cliente nunca assina os dados internos do app;
 * - `private-client-{clientId}`: a sessão de cliente do próprio cliente selecionado, ou o dono
 *   (pré-visualização).
 */

import { isIntegrationId } from "@/lib/integrations/catalog"
import type { SessionPayload } from "@/features/auth/session"
import { appChannel, CLIENT_CHANNEL_PREFIX } from "./channel-names"

export type ParsedChannel = { kind: "app" } | { kind: "integration"; integrationId: string } | { kind: "client"; clientId: string } | { kind: "unknown" }

export function parseChannel(channel: string): ParsedChannel {
    if (channel === appChannel()) return { kind: "app" }
    if (channel.startsWith("private-integration-")) {
        return { kind: "integration", integrationId: channel.slice("private-integration-".length) }
    }
    if (channel.startsWith(CLIENT_CHANNEL_PREFIX)) {
        return { kind: "client", clientId: channel.slice(CLIENT_CHANNEL_PREFIX.length) }
    }
    return { kind: "unknown" }
}

/** Autoriza a assinatura do canal conforme a sessão (assinada pelo servidor). */
export function isChannelAuthorized(channel: string, session: SessionPayload | null): boolean {
    const parsed = parseChannel(channel)
    switch (parsed.kind) {
        case "app":
            return session?.kind === "admin"
        case "integration":
            return session?.kind === "admin" && isIntegrationId(parsed.integrationId)
        case "client":
            if (session?.kind === "admin") return true
            return session?.kind === "client" && session.clientId === parsed.clientId
        default:
            return false
    }
}
