import { z } from "zod"
import { withRoute, parseBody, DomainError } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import type { NextRequest } from "next/server"
import { environmentActor, listRepos } from "./access"
import { environmentSchema, repoConfigSchema, secretInputSchema, operationInputSchema } from "../schemas"
import {
    environmentDetail,
    getRepoConfig,
    listEnvironments,
    saveEnvironment,
    saveRepoConfig,
    saveSshSecrets,
} from "./service"
import { requestOperation } from "./operations"
import { ciCd } from "./github"
import { logsHistory, logViewer } from "./logs"

export const rootRoute = (portal: boolean) =>
    withRoute(async ({ req }) => ok(await listRepos(await environmentActor(req, portal))))
const saveEnvSchema = z
    .object({ config: environmentSchema, revision: z.number().int().nonnegative().optional() })
    .strict()
const saveConfigSchema = z.object({ config: repoConfigSchema, revision: z.number().int().nonnegative() }).strict()
const viewerSchema = z.object({ viewerId: z.string().uuid(), remove: z.boolean() }).strict()

export function environmentRoute(portal: boolean) {
    const handler = withRoute<{ route: string }>(async ({ req, params }) => {
        const actor = await environmentActor(req, portal)
        const [repoId, resource, envId, action, ...extra] = params.route.split("/")
        if (extra.length) throw new DomainError(404, "Rota não encontrada")
        const method = req.method
        if (resource === "config" && !envId) {
            if (method === "GET") return ok(await getRepoConfig(actor, repoId))
            if (method === "PUT") {
                const body = await parseBody(req, saveConfigSchema)
                if (!body.ok) return body.response
                return ok(await saveRepoConfig(actor, repoId, body.data.config, body.data.revision))
            }
        }
        if (resource === "secrets" && !envId && method === "PUT") {
            const body = await parseBody(req, secretInputSchema)
            if (!body.ok) return body.response
            return ok(await saveSshSecrets(actor, repoId, body.data))
        }
        if (resource === "ci-cd" && !envId && method === "GET")
            return ok(
                await ciCd(
                    actor,
                    repoId,
                    req.nextUrl.searchParams.get("workflow") || undefined,
                    req.nextUrl.searchParams.get("branch") || undefined,
                    Math.min(1000, Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1)),
                ),
            )
        if (!resource && method === "GET") return ok(await listEnvironments(actor, repoId))
        if (resource === "environments" && !action) {
            if (method === "GET" && envId) return ok(await environmentDetail(actor, repoId, envId))
            if ((method === "POST" && !envId) || (method === "PUT" && envId)) {
                const body = await parseBody(req, saveEnvSchema)
                if (!body.ok) return body.response
                return ok(await saveEnvironment(actor, repoId, body.data.config, envId, body.data.revision))
            }
        }
        if (resource === "environments" && envId) {
            if (action === "operations" && method === "POST") {
                const body = await parseBody(req, operationInputSchema)
                if (!body.ok) return body.response
                return ok(await requestOperation(actor, repoId, envId, body.data), { status: 202 })
            }
            if (action === "logs" && method === "GET")
                return ok(
                    await logsHistory(
                        actor,
                        repoId,
                        envId,
                        req.nextUrl.searchParams.get("after") || undefined,
                        req.nextUrl.searchParams.get("service") || undefined,
                    ),
                )
            if (action === "viewer" && method === "POST") {
                const body = await parseBody(req, viewerSchema)
                if (!body.ok) return body.response
                return ok(await logViewer(actor, repoId, envId, body.data.viewerId, body.data.remove))
            }
        }
        throw new DomainError(404, "Rota não encontrada")
    })
    return (req: NextRequest, context: { params: Promise<{ path: string[] }> }) =>
        handler(req, { params: context.params.then(({ path }) => ({ route: path.join("/") })) })
}
