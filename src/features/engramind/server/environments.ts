import { Environment, environmentsDb, type IEnvironment } from "@/features/environments/server/models"

export interface EnvironmentOptionDto {
    id: string
    name: string
    slug: string
    /** Pasta (adotado) ou origem central. */
    location: string
    machine: string
}

/** Opções leves do seletor de Ambiente (sem os snapshots do Docker da lista de Ambientes). */
export async function listEnvironmentOptions(): Promise<EnvironmentOptionDto[]> {
    await environmentsDb()
    const envs = await Environment.find({}, { name: 1, slug: 1, source: 1 }).sort({ name: 1 }).lean<IEnvironment[]>()
    return envs.map((env) => ({
        id: String(env._id),
        name: env.name,
        slug: env.slug,
        location: env.source.kind === "adopted" ? env.source.workingDir : `central (${env.source.composeFile})`,
        machine: env.source.kind === "adopted" ? env.source.machine : "server",
    }))
}
