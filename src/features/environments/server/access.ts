import type { NextRequest } from "next/server"
import { requireAdminSession, requireClientActor } from "@/features/auth/server/context"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { Project } from "@/lib/db/models/Project"
import { getLocalUser } from "@/lib/local-user"
import { objectIdSchema } from "../schemas"

export interface EnvironmentActor {
    userId: string
    clientId: string | null
    projectIds: string[] | null
    canEdit: boolean
    owner: boolean
}
export async function environmentActor(req: NextRequest, portal = false): Promise<EnvironmentActor> {
    if (portal) {
        const actor = await requireClientActor(req)
        return {
            userId: actor.userId,
            clientId: String(actor.client._id),
            projectIds: actor.client.projectIds.map(String),
            canEdit: actor.isAdmin,
            owner: actor.preview,
        }
    }
    await requireAdminSession(req)
    return { userId: getLocalUser().id, clientId: null, projectIds: null, canEdit: true, owner: true }
}
export function assertProjectAccess(actor: EnvironmentActor, id: string): void {
    if (!objectIdSchema.safeParse(id).success) throw new DomainError(400, "Repositório inválido")
    if (actor.projectIds && !actor.projectIds.includes(id)) throw new DomainError(404, "Repositório não encontrado")
}
export function assertEdit(actor: EnvironmentActor): void {
    if (!actor.canEdit)
        throw new DomainError(403, "Apenas o dono ou administradores do cliente podem configurar ambientes")
}
export async function accessibleProject(actor: EnvironmentActor, id: string) {
    assertProjectAccess(actor, id)
    await dbConnect()
    const project = await Project.findById(id).lean()
    if (!project) throw new DomainError(404, "Repositório não encontrado")
    return project
}
export async function listRepos(actor: EnvironmentActor) {
    await dbConnect()
    const repos = await Project.find(actor.projectIds ? { _id: { $in: actor.projectIds } } : {})
        .sort({ name: 1 })
        .lean()
    return repos.map((p) => ({ id: String(p._id), name: p.name, repo: p.repo }))
}
