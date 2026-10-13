import { DomainError } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import type { ClientActor } from "@/features/auth/server/context"

/**
 * Ator do módulo Ambientes. O **dono** vê todos os repositórios; o **usuário de cliente** só os
 * repositórios vinculados ao cliente selecionado (`OrcamentoClient.projectIds`). Criar/editar
 * ambiente é do dono e do **admin do cliente**; segredos (SSH, connection string, variáveis
 * secretas e comandos de versão) são **exclusivos do dono**.
 */

export interface EnvironmentActor {
    kind: "owner" | "client"
    /** Ator da auditoria (`local` ou o id do usuário). */
    userId: string
    clientId: string | null
    isAdmin: boolean
    /** Projetos acessíveis (vazio no dono = todos). */
    projectIds: string[]
}

export function ownerActor(): EnvironmentActor {
    const owner = getLocalUser()
    return { kind: "owner", userId: owner.id, clientId: null, isAdmin: true, projectIds: [] }
}

export function fromClientActor(actor: ClientActor): EnvironmentActor {
    return {
        kind: "client",
        userId: actor.userId,
        clientId: String(actor.client._id),
        isAdmin: actor.isAdmin,
        projectIds: (actor.client.projectIds ?? []).map(String),
    }
}

export function isOwner(actor: EnvironmentActor): boolean {
    return actor.kind === "owner"
}

/** O dono vê tudo; o cliente, só os projetos vinculados. */
export function canAccessProject(actor: EnvironmentActor, projectId: string): boolean {
    if (actor.kind === "owner") return true
    return actor.projectIds.includes(String(projectId))
}

export function assertCanAccessProject(actor: EnvironmentActor, projectId: string): void {
    if (!canAccessProject(actor, projectId)) throw new DomainError(403, "Você não tem acesso a este repositório.", "PROJECT_FORBIDDEN")
}

/** Criar/editar/excluir ambiente: dono ou admin do cliente. */
export function assertCanManage(actor: EnvironmentActor): void {
    if (actor.kind === "owner" || actor.isAdmin) return
    throw new DomainError(403, "Apenas administradores podem alterar ambientes.", "FORBIDDEN")
}

/** Segredos e comandos arbitrários: só o dono. */
export function assertCanManageSecrets(actor: EnvironmentActor): void {
    if (actor.kind === "owner") return
    throw new DomainError(403, "Apenas o dono do Opex pode configurar credenciais.", "FORBIDDEN")
}

/** Publicar/restaurar/ver logs: qualquer usuário com acesso ao repositório. */
export function assertCanOperate(actor: EnvironmentActor, projectId: string): void {
    assertCanAccessProject(actor, projectId)
}
