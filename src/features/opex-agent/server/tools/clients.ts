import { z } from "zod"
import { clienteOrcamentoSchema, clienteUserSchema } from "@/features/orcamentos/schemas"
import { createClient, deleteClient, getClient, getClientDto, listClients, regenerateClientToken, updateClient } from "@/features/orcamentos/server/clients"
import { clientScope, listDrafts } from "@/features/orcamentos/server/drafts"
import { createClientUser, deleteClientUser, listClientUsers, regenerateClientUserToken, updateClientUser } from "@/features/orcamentos/server/users"
import type { ClienteOrcamentoDto, ClienteUserDto, OrcamentoDraftDto } from "@/features/orcamentos/types"
import { defineTool } from "./define"

/**
 * Clientes do portal de Orçamentos, usuários do portal e prévias de orçamento. Tokens e URLs de
 * login (`portalPath` carrega o token) e senhas NUNCA saem para o modelo: quem precisa do token
 * copia na tela Integrações › Clientes.
 */

const SECRET_REDACTED = "[segredo omitido]"
const TOKEN_NOTE = "O token não é exibido no chat: copie a URL de acesso na tela Integrações › Clientes."

const clientId = z.string().describe("Id do cliente (de list_clients)")

/** Sem `portalPath` (a URL carrega o token). */
function slimClient(client: ClienteOrcamentoDto) {
    return {
        id: client.id,
        name: client.name,
        tokenPrefix: client.tokenPrefix,
        projectIds: client.projectIds,
        projects: client.projects.map((project) => ({ id: project.id, name: project.name, repo: project.repo })),
        hourlyRate: client.hourlyRate,
        profitFactor: client.profitFactor,
        active: client.active,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
    }
}

function slimUser(user: ClienteUserDto) {
    return { id: user.id, username: user.username, email: user.email, admin: user.admin, isDefault: user.isDefault, active: user.active, memberships: user.memberships, createdAt: user.createdAt }
}

function slimDraft(draft: OrcamentoDraftDto) {
    return {
        id: draft.id,
        status: draft.status,
        projectName: draft.projectName,
        description: draft.description.slice(0, 2000),
        title: draft.preview?.title ?? null,
        estimate: draft.estimate,
        taskId: draft.taskId,
        createdAt: draft.createdAt,
    }
}

const clientInput = {
    name: z.string(),
    projectIds: z.array(z.string()).describe("Projetos/repositórios do cliente (de get_task_options)"),
    hourlyRate: z.number().describe("Custo por hora (R$)"),
    profitFactor: z.number().describe("Fator de lucro (≥ 1)"),
    active: z.boolean(),
}

const userInput = {
    username: z.string(),
    email: z.string().optional(),
    password: z.string().optional().describe("Senha (nunca é exibida nem guardada no histórico); na edição, vazio mantém a atual"),
    admin: z.boolean(),
}
const redactPassword = <T extends { password?: string }>(input: T) => ({ ...input, password: input.password ? SECRET_REDACTED : input.password })

export const clientTools = [
    defineTool({
        name: "list_clients",
        group: "clients",
        label: "Listar clientes",
        risk: "read",
        description: "Clientes do portal de Orçamentos: repositórios, custo por hora, fator de lucro e se estão ativos.",
        input: z.object({}),
        execute: async () => (await listClients()).map(slimClient),
    }),
    defineTool({
        name: "get_client",
        group: "clients",
        label: "Ler cliente",
        risk: "read",
        description: "Um cliente com os usuários do portal (username, e-mail, admin, ativo) e as prévias de orçamento mais recentes enviadas pelo portal.",
        input: z.object({ clientId }),
        execute: async ({ clientId: id }) => {
            const doc = await getClient(id)
            const [client, users, drafts] = await Promise.all([getClientDto(id), listClientUsers(doc), listDrafts(clientScope(doc), { limit: 20 })])
            return { ...slimClient(client), users: users.map(slimUser), previews: drafts.map(slimDraft) }
        },
    }),
    defineTool({
        name: "create_client",
        group: "clients",
        label: "Criar cliente",
        risk: "destructive",
        description: "Cria um cliente do portal (gera o token de acesso, que não aparece no chat).",
        input: z.object(clientInput),
        summarize: (input) => `Criar o cliente "${input.name}" (com token de acesso ao portal)`,
        execute: async (input, context) => {
            const created = await createClient(clienteOrcamentoSchema.parse(input), context.actorId)
            return { client: slimClient(created.item), note: TOKEN_NOTE }
        },
    }),
    defineTool({
        name: "update_client",
        group: "clients",
        label: "Editar cliente",
        risk: "write",
        description: "Altera nome, repositórios, custo por hora, fator de lucro ou se o cliente está ativo (envie todos os campos; veja get_client).",
        input: z.object({ clientId, ...clientInput }),
        summarize: (input) => `Editar o cliente "${input.name}"`,
        execute: async ({ clientId: id, ...input }, context) => slimClient(await updateClient(id, clienteOrcamentoSchema.parse(input), context.actorId)),
    }),
    defineTool({
        name: "regenerate_client_token",
        group: "clients",
        label: "Regerar token do cliente",
        risk: "destructive",
        description: "Gera um token novo para o cliente: a URL de acesso antiga para de funcionar na hora (use para revogar um token vazado).",
        input: z.object({ clientId }),
        summarize: () => "Regerar o token do cliente (a URL de acesso atual para de funcionar)",
        execute: async ({ clientId: id }, context) => {
            const result = await regenerateClientToken(id, context.actorId)
            return { client: slimClient(result.item), note: TOKEN_NOTE }
        },
    }),
    defineTool({
        name: "delete_client",
        group: "clients",
        label: "Excluir cliente",
        risk: "destructive",
        description: "Exclui o cliente, as prévias de orçamento dele e os vínculos dos usuários (usuários sem outro cliente são excluídos).",
        input: z.object({ clientId }),
        summarize: () => "Excluir o cliente, as prévias dele e os vínculos dos usuários",
        execute: async ({ clientId: id }, context) => {
            await deleteClient(id, context.actorId)
            return { ok: true }
        },
    }),
    defineTool({
        name: "create_client_user",
        group: "clients",
        label: "Criar usuário do portal",
        risk: "destructive",
        description: "Cria um usuário do portal para o cliente (username, e-mail e senha opcionais, admin no cliente).",
        input: z.object({ clientId, ...userInput }),
        summarize: (input) => `Criar o usuário "${input.username}" no portal do cliente`,
        redact: redactPassword,
        execute: async ({ clientId: id, ...input }, context) => {
            const created = await createClientUser(await getClient(id), clienteUserSchema.parse(input), context.actorId)
            return { user: slimUser(created.item), note: created.token ? TOKEN_NOTE : null }
        },
    }),
    defineTool({
        name: "update_client_user",
        group: "clients",
        label: "Editar usuário do portal",
        risk: "destructive",
        description: "Altera username, e-mail, senha (vazio mantém) ou o papel de admin de um usuário do portal.",
        input: z.object({ clientId, userId: z.string(), ...userInput }),
        summarize: (input) => `Editar o usuário "${input.username}" do portal${input.password ? " (com nova senha)" : ""}`,
        redact: redactPassword,
        execute: async ({ clientId: id, userId, ...input }, context) => slimUser(await updateClientUser(await getClient(id), userId, clienteUserSchema.parse(input), context.actorId, { owner: true })),
    }),
    defineTool({
        name: "regenerate_client_user_token",
        group: "clients",
        label: "Regerar token do usuário",
        risk: "destructive",
        description: "Gera um token novo para o usuário do portal: a URL de login antiga dele para de funcionar.",
        input: z.object({ clientId, userId: z.string() }),
        summarize: () => "Regerar o token do usuário do portal (a URL de login atual para de funcionar)",
        execute: async ({ clientId: id, userId }, context) => {
            const result = await regenerateClientUserToken(await getClient(id), userId, context.actorId, { owner: true })
            return { user: slimUser(result.item), note: TOKEN_NOTE }
        },
    }),
    defineTool({
        name: "delete_client_user",
        group: "clients",
        label: "Excluir usuário do portal",
        risk: "destructive",
        description: "Exclui o vínculo do usuário com o cliente (o usuário padrão não pode ser excluído).",
        input: z.object({ clientId, userId: z.string() }),
        summarize: () => "Excluir o usuário do portal do cliente",
        execute: async ({ clientId: id, userId }, context) => {
            await deleteClientUser(await getClient(id), userId, context.actorId, { owner: true })
            return { ok: true }
        },
    }),
]
