import { DomainError } from "@/lib/api/route"
import { AgenticCentral } from "@/lib/db/models/Agentic"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { clientChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { assertClientAdmin, type ClientActor } from "@/features/auth/server/context"
import type { HostRunner } from "@/features/local-docker/server/shell"
import { CLIENTE_ENVIRONMENTS_EVENT, type PortalEnvironmentAction } from "../constants"
import type { EnvironmentDto, PortalEnvironmentDto } from "../types"
import { healthOf } from "../view"
import { runEnvironmentAction } from "./deploy"
import { Environment, environmentsDb, type IEnvironment } from "./models"
import { environmentItems } from "./service"
import { envLog, runEnvHost, type EnvironmentChange } from "./settings"

/**
 * Ambientes no **portal do cliente** (`/cliente/ambientes`). O cliente vê só os ambientes de origem
 * **central** cujo repositório (`AgenticCentral.projectId`) está em `client.projectIds` — o vínculo é
 * conferido em toda requisição; projetos adotados ficam só com o dono. A visão é reduzida (sem
 * variáveis, máquinas, caminhos, portas, containers nem log) e as ações são só implantar a ref salva,
 * levantar e reiniciar, pelo admin do cliente, chamando os mesmos serviços do dono.
 */

type PortalClient = Pick<ClientActor["client"], "_id" | "projectIds">

const NOT_FOUND = () => new DomainError(404, "Ambiente não encontrado", "ENVIRONMENT_NOT_FOUND")

/** Centrais dos repositórios vinculados ao cliente. */
async function clientCentralIds(client: PortalClient): Promise<string[]> {
    if (!client.projectIds?.length) return []
    const centrals = await AgenticCentral.find({ projectId: { $in: client.projectIds } }).select({ _id: 1 }).lean()
    return centrals.map((central) => String(central._id))
}

/** Ambientes do cliente (só de central vinculada), por nome. */
async function clientEnvironments(client: PortalClient): Promise<IEnvironment[]> {
    await environmentsDb()
    const centralIds = await clientCentralIds(client)
    if (!centralIds.length) return []
    return Environment.find({ "source.kind": "central", "source.centralId": { $in: centralIds } }).sort({ name: 1 }).lean<IEnvironment[]>()
}

/** Visão reduzida do ambiente para o portal (puro). */
export function toPortalEnvironment(env: EnvironmentDto): PortalEnvironmentDto {
    const last = env.lastDeploy
    return {
        id: env.id,
        name: env.name,
        slug: env.slug,
        ref: env.source.kind === "central" ? env.source.ref : "",
        health: healthOf(env),
        deployedVersion: env.deployedVersion,
        services: env.services.map((service) => ({ service: service.service, state: service.state, status: service.status, version: service.version })),
        lastDeploy: last && last.kind !== "delete" ? { status: last.status, startedAt: last.startedAt, finishedAt: last.finishedAt, durationMs: last.durationMs, version: last.version } : null,
        deploying: last?.status === "running",
    }
}

export async function listPortalEnvironments(client: PortalClient, run: HostRunner = runEnvHost): Promise<PortalEnvironmentDto[]> {
    const envs = await clientEnvironments(client)
    if (!envs.length) return []
    const { items } = await environmentItems(envs, run)
    return items.map(toPortalEnvironment)
}

/** Ambiente do cliente ou 404 (ambiente de outro cliente, adotado ou inexistente: mesma resposta). */
export async function loadPortalEnvironment(client: PortalClient, id: string): Promise<IEnvironment> {
    const env = (await clientEnvironments(client)).find((item) => String(item._id) === id)
    if (!env) throw NOT_FOUND()
    return env
}

/**
 * Implantar (a ref salva do ambiente, sem trocar de máquina), levantar ou reiniciar — só o admin do
 * cliente. A auditoria fica com o usuário do portal; o deploy segue em segundo plano (evento no canal
 * do cliente).
 */
export async function runPortalEnvironmentAction(actor: ClientActor, id: string, action: PortalEnvironmentAction, run: HostRunner = runEnvHost): Promise<{ started: boolean }> {
    assertClientAdmin(actor)
    await loadPortalEnvironment(actor.client, id)
    if (action === "deploy") {
        await runEnvironmentAction(id, { action: "deploy" }, actor.userId, run)
        envLog.info({ id, clientId: String(actor.client._id), userId: actor.userId }, "[environments] Deploy pedido pelo portal do cliente")
        return { started: true }
    }
    await runEnvironmentAction(id, { action }, actor.userId, run)
    envLog.info({ id, action, clientId: String(actor.client._id), userId: actor.userId }, "[environments] Ação pedida pelo portal do cliente")
    return { started: false }
}

/** Clientes ativos que veem o ambiente (central → repositório → `projectIds`). */
async function clientsOfCentral(centralId: string): Promise<string[]> {
    const central = await AgenticCentral.findById(centralId).select({ projectId: 1 }).lean()
    if (!central?.projectId) return []
    const clients = await OrcamentoClient.find({ active: true, projectIds: central.projectId }).select({ _id: 1 }).lean()
    return clients.map((client) => String(client._id))
}

/** `{ id, change }` nos canais dos clientes vinculados (payload mínimo; adotado não avisa ninguém). */
export async function publishPortalEnvironment(id: string, change: EnvironmentChange, centralId?: string | null): Promise<void> {
    let central = centralId ?? null
    if (!central) {
        const env = await Environment.findById(id).select({ source: 1 }).lean<Pick<IEnvironment, "source">>()
        central = env?.source.kind === "central" ? env.source.centralId : null
    }
    if (!central) return
    const clients = await clientsOfCentral(central)
    await publishToChannels(clients.map(clientChannel), CLIENTE_ENVIRONMENTS_EVENT, { id, change })
}

/** Ambiente do cliente por id ou slug (ferramentas do Agente Opex no portal). */
export async function resolvePortalEnvironment(client: PortalClient, ref: string): Promise<IEnvironment> {
    const value = ref.trim()
    const env = (await clientEnvironments(client)).find((item) => String(item._id) === value || item.slug === value)
    if (!env) throw new DomainError(404, `Ambiente "${value}" não encontrado entre os ambientes do cliente`, "ENVIRONMENT_NOT_FOUND")
    return env
}
