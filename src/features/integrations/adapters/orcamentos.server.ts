import type { NextRequest } from "next/server"
import { defineIntegrationServer, okResponse, parseBody, route, type IntegrationTester } from "@nandobfer/integracoes/server"
import { requireAdminSession } from "@/features/auth/server/context"
import { clienteOrcamentoSchema, clienteUserSchema } from "@/features/orcamentos/schemas"
import { clientMaddoxAgentConfigSchema } from "@/features/maddox-agent/schemas"
import { clientOpexAgentConfigSchema } from "@/features/opex-agent/schemas"

/** Clientes: sem serviço externo — só confere o cadastro de clientes. */
const testOrcamentos: IntegrationTester = async ({ emit }) => {
    const [{ dbConnect }, { OrcamentoClient }] = await Promise.all([import("@/lib/db"), import("@/lib/db/models/Orcamento")])
    await dbConnect()
    const total = await OrcamentoClient.countDocuments()
    const active = await OrcamentoClient.countDocuments({ active: true })
    emit("info", `${total} cliente(s) cadastrado(s), ${active} ativo(s)`)
    return `Portal de clientes disponível (${active} cliente(s) ativo(s))`
}

const admin = (request: Request) => requireAdminSession(request as NextRequest)
const clients = () => import("@/features/orcamentos/server/clients")
const users = () => import("@/features/orcamentos/server/users")

/** Clientes do portal (`/api/integrations/orcamentos/clients/*`): cadastro, token, usuários e agentes do cliente. */
export const orcamentosAdapter = defineIntegrationServer({
    id: "orcamentos",
    tester: testOrcamentos,
    routes: [
        /** Clientes do portal (sem o token). */
        route("GET", "orcamentos/clients", async () => okResponse(await (await clients()).listClients())),
        /** Novo cliente (devolve o token uma única vez). */
        route("POST", "orcamentos/clients", async ({ request, actor }) => {
            const body = await parseBody(request, clienteOrcamentoSchema)
            if (!body.ok) return body.response
            return okResponse(await (await clients()).createClient(body.data, actor.id), { status: 201 })
        }),
        route("GET", "orcamentos/clients/:id", async ({ request, params }) => {
            await admin(request)
            return okResponse(await (await clients()).getClientDto(params.id!))
        }),
        route("PATCH", "orcamentos/clients/:id", async ({ request, params, actor }) => {
            const body = await parseBody(request, clienteOrcamentoSchema)
            if (!body.ok) return body.response
            return okResponse(await (await clients()).updateClient(params.id!, body.data, actor.id))
        }),
        /** Exclui o cliente e os rascunhos dele. */
        route("DELETE", "orcamentos/clients/:id", async ({ params, actor }) => {
            await (await clients()).deleteClient(params.id!, actor.id)
            return okResponse({ id: params.id })
        }),
        /** Gera um novo token (invalida o anterior). */
        route("POST", "orcamentos/clients/:id/token", async ({ params, actor }) => okResponse(await (await clients()).regenerateClientToken(params.id!, actor.id), { status: 201 })),
        route("GET", "orcamentos/clients/:id/users", async ({ request, params }) => {
            await admin(request)
            return okResponse(await (await users()).listClientUsers(await (await clients()).getClient(params.id!)))
        }),
        route("POST", "orcamentos/clients/:id/users", async ({ request, params, actor }) => {
            await admin(request)
            const body = await parseBody(request, clienteUserSchema)
            if (!body.ok) return body.response
            return okResponse(await (await users()).createClientUser(await (await clients()).getClient(params.id!), body.data, actor.id), { status: 201 })
        }),
        route("PATCH", "orcamentos/clients/:id/users/:userId", async ({ request, params, actor }) => {
            await admin(request)
            const body = await parseBody(request, clienteUserSchema)
            if (!body.ok) return body.response
            return okResponse(await (await users()).updateClientUser(await (await clients()).getClient(params.id!), params.userId!, body.data, actor.id, { owner: true }))
        }),
        route("DELETE", "orcamentos/clients/:id/users/:userId", async ({ request, params, actor }) => {
            await admin(request)
            await (await users()).deleteClientUser(await (await clients()).getClient(params.id!), params.userId!, actor.id, { owner: true })
            return okResponse({ id: params.userId })
        }),
        route("POST", "orcamentos/clients/:id/users/:userId/token", async ({ request, params, actor }) => {
            await admin(request)
            return okResponse(await (await users()).regenerateClientUserToken(await (await clients()).getClient(params.id!), params.userId!, actor.id, { owner: true }))
        }),
        /** Maddox do cliente (desligado por padrão) e ferramentas ligadas. */
        route("GET", "orcamentos/clients/:id/maddox-agent", async ({ request, params }) => {
            await admin(request)
            return okResponse(await (await import("@/features/maddox-agent/server/client-config")).getClientMaddoxConfig(params.id!))
        }),
        route("PUT", "orcamentos/clients/:id/maddox-agent", async ({ request, params, actor }) => {
            await admin(request)
            const body = await parseBody(request, clientMaddoxAgentConfigSchema)
            if (!body.ok) return body.response
            return okResponse(await (await import("@/features/maddox-agent/server/client-config")).saveClientMaddoxConfig(params.id!, body.data, actor.id))
        }),
        /** Agente Opex do cliente: ativa/desativa e escolhe as ferramentas (auditado). */
        route("GET", "orcamentos/clients/:id/opex-agent", async ({ request, params }) => {
            await admin(request)
            return okResponse(await (await import("@/features/opex-agent/server/client-config")).getClientOpexConfig(params.id!))
        }),
        route("PUT", "orcamentos/clients/:id/opex-agent", async ({ request, params, actor }) => {
            await admin(request)
            const body = await parseBody(request, clientOpexAgentConfigSchema)
            if (!body.ok) return body.response
            return okResponse(await (await import("@/features/opex-agent/server/client-config")).saveClientOpexConfig(params.id!, body.data, actor.id))
        }),
    ],
})
