import { dbConnect } from "@/lib/db"
import { Environment, type IEnvironment } from "@/lib/db/models/Environment"
import { Project, type IProject } from "@/lib/db/models/Project"
import { DomainError } from "@/lib/api/route"
import { composeProjectName, slugify } from "../logic"
import { DEFAULT_COMPOSE_FILE } from "../constants"
import { createEnvironmentHost, type EnvironmentHost, type ResolvedRepoConnection } from "./runner"
import { getRepoConfig, repoConnectionString, resolveRepoConnection, environmentConnectionString } from "./repo-config"
import type { ComposeInvocation } from "./docker"

/**
 * Contexto de execução de um ambiente: reúne o ambiente, o repositório, a configuração de execução,
 * o host (local/remoto), o diretório e a invocação do Compose (com o override). Também resolve a
 * connection string (override do ambiente ou padrão do repositório) e os segredos a mascarar.
 */

export interface EnvironmentRuntime {
    env: IEnvironment & { _id: unknown }
    project: IProject
    connection: ResolvedRepoConnection
    host: EnvironmentHost
    /** Diretório do repositório no host. */
    directory: string
    /** Nome do projeto Compose (isola por ambiente). */
    projectName: string
    /** Arquivo de override gerado pelo Opex, fora do versionamento. */
    overrideFile: string
    invocation: ComposeInvocation
    connectionString: string | null
    /** Valores de segredo para mascarar nos logs. */
    secrets: string[]
}

function requireDirectory(env: IEnvironment, connection: ResolvedRepoConnection): string {
    const directory = env.hostDirectory.trim() || connection.repositoryDirectory.trim()
    if (!directory) throw new DomainError(400, "Defina o diretório do repositório no host (configuração do ambiente ou do repositório).", "HOST_DIRECTORY_MISSING")
    return directory
}

export async function loadEnvironmentRuntime(envId: string): Promise<EnvironmentRuntime> {
    await dbConnect()
    const env = (await Environment.findById(envId).lean()) as (IEnvironment & { _id: unknown }) | null
    if (!env) throw new DomainError(404, "Ambiente não encontrado", "ENVIRONMENT_NOT_FOUND")
    const project = (await Project.findById(env.projectId).lean()) as IProject | null
    if (!project) throw new DomainError(404, "Repositório não encontrado", "PROJECT_NOT_FOUND")
    const config = await getRepoConfig(env.projectId)
    if (!config) throw new DomainError(409, "Configure a execução do repositório antes de operar o ambiente.", "REPO_CONFIG_MISSING")
    const connection = resolveRepoConnection(config)
    const host = createEnvironmentHost(connection)
    const directory = requireDirectory(env, connection)
    const projectName = composeProjectName(project.repo, env.slug)
    const overrideFile = `${directory}/.opex/${projectName}.override.yml`
    const invocation: ComposeInvocation = {
        projectName,
        composeFile: env.composeFile || DEFAULT_COMPOSE_FILE,
        overrideFile,
    }
    const connectionString = environmentConnectionString(env.connectionString) ?? repoConnectionString(config)
    const secrets = [
        connectionString,
        connection.sshPassword,
        connection.sshPrivateKey,
        connection.sshPassphrase,
        ...(env.envVars ?? []).filter((variable) => variable.secret).map((variable) => variable.value),
    ].filter((value): value is string => typeof value === "string" && value.length >= 4)
    return { env, project, connection, host, directory, projectName, overrideFile, invocation, connectionString, secrets }
}

export function projectRepoSlug(project: IProject): string {
    return slugify(project.repo, "repo")
}
