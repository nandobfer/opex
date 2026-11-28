import type { NextRequest } from "next/server"
import { buildIntegrationUpdateSchema } from "@nandobfer/integracoes"
import { defineIntegrationServer, okResponse, parseBody, route } from "@nandobfer/integracoes/server"
import { requireAdminSession } from "@/features/auth/server/context"
import { integrationsRegistry } from "../registry/definitions"

/** Builder Machine: ponto de montagem — ver aicontext/modules/builder-machine.md. */
export const builderMachineAdapter = defineIntegrationServer({
    id: "builder_machine",
    tester: async (context) => (await import("@/features/local-docker/server/tester")).testBuilderMachine(context),
    /** Ao ativar: liga a limpeza diária e prepara o PC (falha no gancho não desfaz a ativação). */
    onEnable: async (actorId) => (await import("@/features/local-docker/server/cleanup")).onBuilderMachineEnabled(actorId),
})

/** Engramind: teste, explorador com o token admin do Opex (campo privado, só no servidor). */
export const engramindAdapter = defineIntegrationServer<{ adminToken?: string }>({
    id: "engramind",
    tester: async (context) => (await import("@/features/engramind/server/tester")).testEngramind(context),
    explorer: { authorize: (values) => (values.adminToken ? { Authorization: `Bearer ${values.adminToken}` } : null) },
})

/** Evolution API (OPE-192): teste e o pré-preenchimento pelo ambiente `evolution-api` (`/api/integrations/evolution-api/prefill`). */
export const evolutionAdapter = defineIntegrationServer({
    id: "evolution-api",
    tester: async (context) => (await import("@/features/evolution-api/server/tester")).testEvolution(context),
    routes: [
        /** Valores inferidos do ambiente `evolution-api`, sem a chave. */
        route("GET", "evolution-api/prefill", async ({ request }) => {
            await requireAdminSession(request as NextRequest)
            return okResponse(await (await import("@/features/evolution-api/server/prefill")).getEvolutionPrefill())
        }),
        /** Grava o formulário e a chave do ambiente na mesma atualização. */
        route("POST", "evolution-api/prefill", async ({ request, actor }) => {
            await requireAdminSession(request as NextRequest)
            const body = await parseBody(request, buildIntegrationUpdateSchema(integrationsRegistry.require("evolution-api")))
            if (!body.ok) return body.response
            return okResponse(await (await import("@/features/evolution-api/server/prefill")).applyEnvironmentKey({ ...body.data, secrets: undefined }, actor.id))
        }),
    ],
})
