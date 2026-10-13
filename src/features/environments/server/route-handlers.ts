import type { NextRequest } from "next/server"
import { parseBody, withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { queryToObject } from "@/lib/api/query"
import { environmentRepoUpdateSchema, environmentSchema, publishInputSchema, restoreInputSchema } from "../schemas"
import type { EnvironmentActor } from "./actor"
import { assertCanAccessProject } from "./actor"
import { loadProject, listProjectOptions } from "./projects"
import { getOrCreateRepoConfig, toRepoConfigDto, updateRepoConfig } from "./repo-config"
import {
    assertEnvironmentAccess,
    createEnvironment,
    deleteEnvironment,
    getEnvironmentById,
    getEnvironmentDto,
    listEnvironmentDtos,
    updateEnvironment,
} from "./environments"
import { fetchComposeFile } from "./compose"
import { listEnvironmentImages, startRestore } from "./restore"
import { startPublish } from "./deploy"
import { findOperation, listOperations, operationDto } from "./operations"
import { readEnvironmentLogs } from "./logs"
import { listRuns, listWorkflows } from "./ci-cd"

/**
 * Handlers do módulo Ambientes, parametrizados pelo **ator**. As rotas do dono e do portal do
 * cliente compartilham exatamente a mesma lógica; muda só o resolvedor de ator (e, portanto, o
 * escopo de projetos acessíveis) e a checagem de papel.
 */

export type EnvironmentActorResolver = (req: NextRequest) => Promise<EnvironmentActor>

export function createEnvironmentHandlers(resolveActor: EnvironmentActorResolver) {
    return {
        listProjects: withRoute(async ({ req }) => {
            const actor = await resolveActor(req)
            return ok(await listProjectOptions(actor))
        }),

        getRepoConfig: withRoute<{ projectId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const project = await loadProject(params.projectId)
            assertCanAccessProject(actor, String(project._id))
            const config = await getOrCreateRepoConfig(project, actor.userId)
            return ok(toRepoConfigDto(config, project))
        }),

        updateRepoConfig: withRoute<{ projectId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const project = await loadProject(params.projectId)
            assertCanAccessProject(actor, String(project._id))
            const body = await parseBody(req, environmentRepoUpdateSchema)
            if (!body.ok) return body.response
            const config = await updateRepoConfig(actor, project, body.data)
            return ok(toRepoConfigDto(config, project))
        }),

        listEnvironments: withRoute<{ projectId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            assertCanAccessProject(actor, params.projectId)
            return ok(await listEnvironmentDtos(params.projectId, actor))
        }),

        createEnvironment: withRoute<{ projectId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const project = await loadProject(params.projectId)
            assertCanAccessProject(actor, String(project._id))
            const body = await parseBody(req, environmentSchema)
            if (!body.ok) return body.response
            const env = await createEnvironment(actor, project, body.data)
            return ok(await getEnvironmentDto(env, actor))
        }),

        getEnvironment: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const env = await getEnvironmentById(params.envId)
            assertEnvironmentAccess(actor, env)
            return ok(await getEnvironmentDto(env, actor))
        }),

        updateEnvironment: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const env = await getEnvironmentById(params.envId)
            const body = await parseBody(req, environmentSchema)
            if (!body.ok) return body.response
            const updated = await updateEnvironment(actor, env, body.data)
            return ok(await getEnvironmentDto(updated, actor))
        }),

        deleteEnvironment: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const env = await getEnvironmentById(params.envId)
            await deleteEnvironment(actor, env)
            return ok({ id: params.envId })
        }),

        getCompose: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const env = await getEnvironmentById(params.envId)
            assertEnvironmentAccess(actor, env)
            const project = await loadProject(env.projectId)
            const compose = await fetchComposeFile(project.repo, env.branch, env.composeFile)
            return ok(compose)
        }),

        listImages: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const env = await getEnvironmentById(params.envId)
            assertEnvironmentAccess(actor, env)
            return ok(await listEnvironmentImages(params.envId))
        }),

        listOperations: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const env = await getEnvironmentById(params.envId)
            assertEnvironmentAccess(actor, env)
            const operations = await listOperations(params.envId)
            return ok(operations.map((operation) => operationDto(operation)))
        }),

        getOperation: withRoute<{ envId: string; opId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const env = await getEnvironmentById(params.envId)
            assertEnvironmentAccess(actor, env)
            const operation = await findOperation(params.opId)
            if (!operation || operation.environmentId !== params.envId) {
                const { DomainError } = await import("@/lib/api/route")
                throw new DomainError(404, "Operação não encontrada", "OPERATION_NOT_FOUND")
            }
            return ok(operationDto(operation))
        }),

        publish: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const body = await parseBody(req, publishInputSchema)
            if (!body.ok) return body.response
            return ok(await startPublish(actor, params.envId, body.data))
        }),

        restore: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const body = await parseBody(req, restoreInputSchema)
            if (!body.ok) return body.response
            return ok(await startRestore(actor, params.envId, body.data))
        }),

        listLogs: withRoute<{ envId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const env = await getEnvironmentById(params.envId)
            assertEnvironmentAccess(actor, env)
            const query = queryToObject(req.nextUrl.searchParams)
            const service = typeof query.service === "string" ? query.service : null
            const logs = await readEnvironmentLogs(params.envId, {
                after: typeof query.after === "string" ? query.after : undefined,
                limit: typeof query.limit === "string" ? Number(query.limit) : undefined,
                scope: typeof query.scope === "string" ? query.scope : undefined,
                service,
                filterService: service !== null,
            })
            return ok(logs)
        }),

        ciCd: withRoute<{ projectId: string }>(async ({ req, params }) => {
            const actor = await resolveActor(req)
            const project = await loadProject(params.projectId)
            assertCanAccessProject(actor, String(project._id))
            const query = queryToObject(req.nextUrl.searchParams)
            const workflow = typeof query.workflow === "string" ? query.workflow : undefined
            const branch = typeof query.branch === "string" ? query.branch : undefined
            const limit = typeof query.limit === "string" ? Number(query.limit) : undefined
            const [runs, workflows] = await Promise.all([listRuns(project.repo, { workflow, branch, limit }), listWorkflows(project.repo)])
            return ok({ runs, workflows })
        }),
    }
}
