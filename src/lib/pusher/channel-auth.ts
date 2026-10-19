/**
 * Regras de autorização dos canais privados do Pusher.
 *
 * Só canais CONHECIDOS são autorizados, e o **tipo de sessão** decide quem vê o quê:
 * - `private-app` e `private-integration-{id}`: apenas o **dono** (`kind: "admin"`) — o usuário de
 *   cliente nunca assina os dados internos do app;
 * - `private-client-{clientId}`: a sessão de cliente do próprio cliente selecionado, ou o dono
 *   (pré-visualização);
 * - `private-repo-recents-{ator}`: o **próprio ator** — o dono (`private-repo-recents-local`) ou o
 *   usuário de cliente do seu `userId`. O histórico de um usuário nunca chega a outro.
 * - `private-opex-{clientId}-{userId}`: o **Agente Opex** do próprio usuário no cliente (sessões e
 *   configuração). O usuário de cliente só assina o seu; o dono assina o do `userId` local.
 */

import { isIntegrationId } from "@/lib/integrations/catalog"
import { LOCAL_USER_ID } from "@/lib/local-user"
import type { SessionPayload } from "@/features/auth/session"
import { appChannel, CLIENT_CHANNEL_PREFIX, OPEX_CHANNEL_PREFIX, REPO_RECENTS_CHANNEL_PREFIX } from "./channel-names"
import { parseOpexClientChannel } from "@/features/opex-agent/scope"

export type ParsedChannel =
    | { kind: "app" }
    | { kind: "integration"; integrationId: string }
    | { kind: "client"; clientId: string }
    | { kind: "repoRecents"; actorId: string }
    | { kind: "opex"; clientId: string; userId: string }
    | { kind: "unknown" }

export function parseChannel(channel: string): ParsedChannel {
    if (channel === appChannel()) return { kind: "app" }
    if (channel.startsWith("private-integration-")) {
        return { kind: "integration", integrationId: channel.slice("private-integration-".length) }
    }
    if (channel.startsWith(REPO_RECENTS_CHANNEL_PREFIX)) {
        return { kind: "repoRecents", actorId: channel.slice(REPO_RECENTS_CHANNEL_PREFIX.length) }
    }
    const opex = parseOpexClientChannel(channel)
    if (channel.startsWith(OPEX_CHANNEL_PREFIX) && opex) return { kind: "opex", ...opex }
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
        case "opex":
            if (session?.kind === "admin") return parsed.userId === LOCAL_USER_ID
            return session?.kind === "client" && session.clientId === parsed.clientId && session.userId === parsed.userId
        case "repoRecents":
            if (session?.kind === "admin") return parsed.actorId === LOCAL_USER_ID
            return session?.kind === "client" && session.userId === parsed.actorId
        default:
            return false
    }
}
