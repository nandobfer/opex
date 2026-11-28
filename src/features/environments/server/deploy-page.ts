import { isValidObjectId } from "mongoose"
import type { EnvironmentDeploySummaryDto } from "../types"
import { Environment, EnvironmentDeploy, environmentsDb, type IEnvironment, type IEnvironmentDeploy } from "./models"
import { deploySummary } from "./service"

/** Nome mostrado quando o ambiente do deploy foi apagado (os deploys ficam 90 dias). */
export const REMOVED_ENVIRONMENT_NAME = "Ambiente removido"

export interface DeployPageData {
    deploy: EnvironmentDeploySummaryDto
    environmentId: string
    environmentName: string
}

/**
 * Dados da página `/ambientes/deploys/[deployId]` (OPE-208): o resumo do deploy (sem o log, que chega pelo
 * stream) e o nome do ambiente. `null` quando o id é inválido ou o deploy não existe (a rota responde 404).
 */
export async function loadDeployPage(deployId: string): Promise<DeployPageData | null> {
    if (!isValidObjectId(deployId)) return null
    await environmentsDb()
    const deploy = await EnvironmentDeploy.findById(deployId).select({ log: 0 }).lean<IEnvironmentDeploy>()
    if (!deploy) return null
    const environment = isValidObjectId(deploy.environmentId) ? await Environment.findById(deploy.environmentId).select({ name: 1 }).lean<Pick<IEnvironment, "name">>() : null
    return { deploy: deploySummary(deploy), environmentId: deploy.environmentId, environmentName: environment?.name ?? REMOVED_ENVIRONMENT_NAME }
}
