/**
 * Regras de autorização dos canais privados do Pusher.
 *
 * O app é de uso pessoal, com login por senha única: não há usuário nem permissão por canal para
 * conferir. Mesmo assim só canais CONHECIDOS são autorizados:
 * - `private-app`: dados das telas do app;
 * - `private-integration-{id}`: debug e status de uma integração existente no catálogo.
 */

import { isIntegrationId } from "@/lib/integrations/catalog"
import { appChannel } from "./channel-names"

export type ParsedChannel = { kind: "app" } | { kind: "integration"; integrationId: string } | { kind: "unknown" }

export function parseChannel(channel: string): ParsedChannel {
    if (channel === appChannel()) return { kind: "app" }
    if (channel.startsWith("private-integration-")) {
        return { kind: "integration", integrationId: channel.slice("private-integration-".length) }
    }
    return { kind: "unknown" }
}

export function isChannelAuthorized(channel: string): boolean {
    const parsed = parseChannel(channel)
    switch (parsed.kind) {
        case "app":
            return true
        case "integration":
            return isIntegrationId(parsed.integrationId)
        default:
            return false
    }
}
