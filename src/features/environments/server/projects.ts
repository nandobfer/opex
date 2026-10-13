import { dbConnect } from "@/lib/db"
import { Project, type IProject } from "@/lib/db/models/Project"
import { Environment } from "@/lib/db/models/Environment"
import { EnvironmentRepoConfig } from "@/lib/db/models/EnvironmentRepoConfig"
import type { EnvironmentActor } from "./actor"
import type { EnvironmentProjectDto } from "../types"
import type { WithId } from "./types"

/** Projetos (repositórios) que o ator pode usar no módulo Ambientes. */

export async function listAccessibleProjects(actor: EnvironmentActor): Promise<WithId<IProject>[]> {
    await dbConnect()
    const filter = actor.kind === "owner" ? {} : { _id: { $in: actor.projectIds } }
    return (await Project.find(filter).sort({ name: 1 }).lean()) as unknown as WithId<IProject>[]
}

/** Ids acessíveis, para filtrar consultas sem cruzar com a lista completa. */
export async function accessibleProjectIds(actor: EnvironmentActor): Promise<string[] | null> {
    if (actor.kind === "owner") return null
    return actor.projectIds
}

/** Lista para o seletor da tela, já com o estado de configuração e a contagem de ambientes. */
export async function listProjectOptions(actor: EnvironmentActor): Promise<EnvironmentProjectDto[]> {
    const projects = await listAccessibleProjects(actor)
    if (projects.length === 0) return []
    const ids = projects.map((project) => String(project._id))
    await dbConnect()
    const [configs, counts] = await Promise.all([
        EnvironmentRepoConfig.find({ projectId: { $in: ids } }).select({ projectId: 1 }).lean(),
        Environment.aggregate<{ _id: string; count: number }>([{ $match: { projectId: { $in: ids } } }, { $group: { _id: "$projectId", count: { $sum: 1 } } }]),
    ])
    const configured = new Set(configs.map((config) => config.projectId))
    const countByProject = new Map(counts.map((row) => [String(row._id), row.count]))
    return projects.map((project) => ({
        id: String(project._id),
        repo: project.repo,
        repoUrl: project.repoUrl,
        name: project.name,
        configured: configured.has(String(project._id)),
        environmentCount: countByProject.get(String(project._id)) ?? 0,
    }))
}

export async function loadProject(projectId: string): Promise<WithId<IProject>> {
    const { DomainError } = await import("@/lib/api/route")
    await dbConnect()
    const project = (await Project.findById(projectId).lean()) as unknown as WithId<IProject> | null
    if (!project) throw new DomainError(404, "Repositório não encontrado", "PROJECT_NOT_FOUND")
    return project
}
