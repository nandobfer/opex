import type { ClientActor } from "@/features/auth/server/context"
import { clientActorFor } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import type { IOpexSession, OpexAgentKind } from "@/lib/db/models/Opex"
import { opexSessionAgentFilter } from "../session-filter"

/**
 * Escopo do Agente Opex no servidor (SOMENTE servidor): dono ou usuário do portal.
 *
 * O escopo **não** é confiado a partir do cliente: o ator é revalidado no banco (usuário ativo,
 * vínculo com o cliente, cliente ativo) a cada turno, a cada ferramenta e na confirmação. A sessão
 * guarda só `clientId`/`userId`, nunca o ator pronto.
 */
export type OpexServerScope = ({ kind: "owner" } | { kind: "client"; actor: ClientActor }) & {
    /** Agente das sessões do escopo; ausente = Agente Opex. */
    agent?: OpexAgentKind
    /** Conversa com um agente rotineiro (`agent: "routine"`, OPE-160): o agente das sessões. */
    routineAgentId?: string
}

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
    const owner = scope.kind === "owner" ? { clientId: null } : { clientId: String(scope.actor.client._id), userId: scope.actor.userId }
    const agent = agentOf(scope)
    // Conversa com um agente rotineiro (OPE-160): só do dono e só as daquele agente.
    if (agent === "routine") return { clientId: null, agent: "routine", routineAgentId: scope.routineAgentId ?? "" }
    // Sessões antigas não têm `agent`: as do Agente Opex são as que não são do Maddox nem de rotineiro.
    return { ...owner, agent: agent === "maddox" ? "maddox" : opexSessionAgentFilter() }
}

export function agentOf(scope: OpexServerScope): OpexAgentKind {
    return scope.agent ?? "opex"
}

/** O mesmo escopo, para as sessões de outro agente. */
export function withAgent<S extends OpexServerScope>(scope: S, agent: OpexAgentKind): S {
    return { ...scope, agent }
}

/** Reconstrói o escopo de uma sessão gravada (usado nos follow-ups e na confirmação). */
export async function sessionScopeOf(session: Pick<IOpexSession, "clientId" | "userId" | "agent" | "routineAgentId">): Promise<OpexServerScope> {
    const agent = session.agent ?? "opex"
    if (agent === "routine") return { ...OWNER_SCOPE, agent, routineAgentId: session.routineAgentId ?? "" }
    if (!session.clientId) return { ...OWNER_SCOPE, agent }
    return { kind: "client", actor: await clientActorFor(session.userId, session.clientId), agent }
}

export function clientIdOf(scope: OpexServerScope): string | null {
    return scope.kind === "client" ? String(scope.actor.client._id) : null
}
