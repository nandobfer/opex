import { estimateDeployDuration, NO_DEPLOY_ESTIMATE, type DeployEstimate } from "../deploy-estimate"
import { EnvironmentDeploy, type IEnvironmentDeploy } from "./models"
import { envLog } from "./settings"

/** Deploys com sucesso lidos para a estimativa (a separação por tipo fica no módulo puro). */
const ESTIMATE_QUERY_LIMIT = 30

/** Estimativa do deploy em andamento pelos anteriores com sucesso do ambiente; falha vira sem estimativa. */
export async function loadDeployEstimate(deploy: Pick<IEnvironmentDeploy, "_id" | "environmentId" | "kind">): Promise<DeployEstimate> {
    try {
        const rows = await EnvironmentDeploy.find({ environmentId: deploy.environmentId, status: "success" })
            .select({ kind: 1, startedAt: 1, finishedAt: 1 })
            .sort({ startedAt: -1 })
            .limit(ESTIMATE_QUERY_LIMIT)
            .lean<Pick<IEnvironmentDeploy, "_id" | "kind" | "startedAt" | "finishedAt">[]>()
        const samples = rows
            .filter((row) => row.finishedAt && String(row._id) !== String(deploy._id))
            .map((row) => ({ kind: row.kind, durationMs: new Date(row.finishedAt!).getTime() - new Date(row.startedAt).getTime() }))
        return estimateDeployDuration(samples, deploy.kind)
    } catch (error) {
        envLog.warn({ deployId: String(deploy._id), err: error instanceof Error ? error.message : String(error) }, "[environments] Falha ao estimar a duração do deploy")
        return NO_DEPLOY_ESTIMATE
    }
}
