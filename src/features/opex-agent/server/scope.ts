import type { ClientActor } from "@/features/auth/server/context"
import { clientActorFor } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import type { IOpexSession } from "@/lib/db/models/Opex"

/**
 * Escopo do Agente Opex no servidor (SOMENTE servidor): dono ou usuário do portal.
 *
 * O escopo **não** é confiado a partir do cliente: o ator é revalidado no banco (usuário ativo,
 * vínculo com o cliente, cliente ativo) a cada turno, a cada ferramenta e na confirmação. A sessão
 * guarda só `clientId`/`userId`, nunca o ator pronto.
 */
export type OpexServerScope = { kind: "owner" } | { kind: "client"; actor: ClientActor }

export const OWNER_SCOPE: OpexServerScope = { kind: "owner" }

/** Escopo do portal a partir do ator já autenticado (`requireClientActor`). */
export const clientOpexScope = (actor: ClientActor): OpexServerScope => ({ kind: "client", actor })

export function actorIdOf(scope: OpexServerScope): string {
    return scope.kind === "owner" ? getLocalUser().id : scope.actor.userId
}

export function actorNameOf(scope: OpexServerScope): string {
    return scope.kind === "owner" ? getLocalUser().name : scope.actor.displayName
}

/** Filtro das sessões visíveis no escopo (o dono vê as antigas, sem `clientId`). */
export function sessionFilterOf(scope: OpexServerScope): Record<string, unknown> {
    return scope.kind === "owner" ? { clientId: null } : { clientId: String(scope.actor.client._id), userId: scope.actor.userId }
}

/** Reconstrói o escopo de uma sessão gravada (usado nos follow-ups e na confirmação). */
export async function sessionScopeOf(session: Pick<IOpexSession, "clientId" | "userId">): Promise<OpexServerScope> {
    if (!session.clientId) return OWNER_SCOPE
    return { kind: "client", actor: await clientActorFor(session.userId, session.clientId) }
}

export function clientIdOf(scope: OpexServerScope): string | null {
    return scope.kind === "client" ? String(scope.actor.client._id) : null
}
