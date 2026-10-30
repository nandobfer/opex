import { z } from "zod"
import { OPEX_MCP_TRANSPORTS, opexMcpServerInputSchema, type OpexMcpServerDto, type OpexMcpServerInput } from "../../mcp"
import { setClientMcpAccess } from "../client-config"
import { createMcpServer, deleteMcpServer, getMcpServer, listMcpServers, refreshMcpServer, setMcpServerEnabled, setMcpToolConfirmation, updateMcpServer } from "../mcp/service"
import { defineTool } from "./define"

/**
 * Grupo "MCPs": o agente do dono gerencia os MCPs pelos mesmos serviços da seção MCPs. Gravar MCP
 * (endereço, comando e segredos), excluir e liberar a um cliente são `destructive`; os valores dos
 * segredos nunca voltam (só as chaves) e saem do histórico (`redact`).
 */

const SECRET_REDACTED = "[segredo omitido]"
const mcpId = z.string().regex(/^[a-f0-9]{24}$/i).describe("Id do MCP (de list_mcp_servers)")
const secretKey = z.string().describe("Nome do header (HTTP/SSE) ou da variável de ambiente (stdio)")
const transport = z.enum(OPEX_MCP_TRANSPORTS).describe("http (Streamable HTTP), sse ou stdio (processo no servidor do Opex; só node/npx disponíveis)")

/** Sem `tools`: o retrato das ferramentas vem da conexão, não do modelo. */
const serverOut = (server: OpexMcpServerDto) => ({ ...server, tools: server.tools.map((tool) => ({ name: tool.name, title: tool.title, annotations: tool.annotations })) })

const redactEntries = (entries: { key: string; value?: string | null }[] | undefined) => entries?.map((entry) => ({ key: entry.key, value: entry.value ? SECRET_REDACTED : (entry.value ?? null) }))

const createInput = z.object({
    name: z.string().describe("Nome exibido (ex.: GitHub)"),
    slug: z.string().describe("Identificador único: 2 a 24 caracteres a-z, 0-9 e _ (vira o prefixo mcp_{slug}_ das ferramentas)"),
    description: z.string().optional(),
    transport,
    url: z.string().optional().describe("URL do servidor (http/sse)"),
    command: z.string().optional().describe("Comando (stdio), ex.: npx"),
    args: z.array(z.string()).optional().describe('Argumentos (stdio), ex.: ["-y", "@modelcontextprotocol/server-everything"]'),
    headers: z.array(z.object({ key: secretKey, value: z.string() })).optional().describe("Headers secretos (http/sse), ex.: Authorization"),
    env: z.array(z.object({ key: secretKey, value: z.string() })).optional().describe("Variáveis de ambiente secretas (stdio)"),
    enabled: z.boolean().optional().describe("Padrão: true"),
})

const updateInput = z.object({
    id: mcpId,
    name: z.string().optional(),
    slug: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    transport: transport.optional(),
    url: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    headers: z
        .array(z.object({ key: secretKey, value: z.string().nullable().optional().describe("Novo valor; omitido/null mantém o salvo") }))
        .optional()
        .describe("Lista final de headers: chave fora da lista é removida"),
    env: z
        .array(z.object({ key: secretKey, value: z.string().nullable().optional().describe("Novo valor; omitido/null mantém o salvo") }))
        .optional()
        .describe("Lista final de variáveis: chave fora da lista é removida"),
})

function updatedInput(current: OpexMcpServerDto, input: z.infer<typeof updateInput>): OpexMcpServerInput {
    const keep = (entries: { key: string }[]) => entries.map((entry) => ({ key: entry.key, value: "" }))
    return opexMcpServerInputSchema.parse({
        name: input.name ?? current.name,
        slug: input.slug ?? current.slug,
        description: input.description ?? current.description,
        enabled: input.enabled ?? current.enabled,
        transport: input.transport ?? current.transport,
        url: input.url ?? current.url,
        command: input.command ?? current.command,
        args: input.args ?? current.args,
        headers: input.headers ? input.headers.map((entry) => ({ key: entry.key, value: entry.value ?? "" })) : keep(current.headers),
        env: input.env ? input.env.map((entry) => ({ key: entry.key, value: entry.value ?? "" })) : keep(current.env),
        confirmations: current.confirmations,
    })
}

export const mcpTools = [
    defineTool({
        name: "list_mcp_servers",
        group: "mcps",
        label: "Listar MCPs",
        risk: "read",
        description: "MCPs cadastrados: transporte, endereço/comando, chaves dos segredos (nunca o valor), habilitado, ferramentas descobertas, última falha e quantos clientes têm o MCP liberado.",
        input: z.object({}),
        execute: async () => (await listMcpServers()).map(serverOut),
    }),
    defineTool({
        name: "get_mcp_server",
        group: "mcps",
        label: "Ler MCP",
        risk: "read",
        description: "Detalhe de um MCP, com as ferramentas descobertas e o ajuste de confirmação de cada uma.",
        input: z.object({ id: mcpId }),
        execute: async ({ id }) => serverOut(await getMcpServer(id)),
    }),
    defineTool({
        name: "test_mcp_server",
        group: "mcps",
        label: "Testar MCP",
        risk: "read",
        description: "Conecta ao MCP agora, atualiza a lista de ferramentas descobertas e a situação (erro de conexão).",
        input: z.object({ id: mcpId }),
        execute: async ({ id }) => refreshMcpServer(id),
    }),
    defineTool({
        name: "create_mcp_server",
        group: "mcps",
        label: "Cadastrar MCP",
        risk: "destructive",
        description: "Cadastra um MCP (servidor Model Context Protocol). As ferramentas dele entram para o agente a partir do próximo turno quando habilitado. Depois de gravar, testa a conexão.",
        input: createInput,
        summarize: (input) => `Cadastrar o MCP ${input.name} (${input.transport})`,
        redact: (input) => ({ ...input, headers: redactEntries(input.headers), env: redactEntries(input.env) }),
        execute: async (input, context) => {
            const server = await createMcpServer(
                opexMcpServerInputSchema.parse({
                    name: input.name,
                    slug: input.slug,
                    description: input.description ?? "",
                    enabled: input.enabled ?? true,
                    transport: input.transport,
                    url: input.url ?? "",
                    command: input.command ?? "",
                    args: input.args ?? [],
                    headers: input.headers ?? [],
                    env: input.env ?? [],
                    confirmations: {},
                }),
                context.actorId,
            )
            const connection = await refreshMcpServer(server.id)
            return { server: serverOut(await getMcpServer(server.id)), connection: { ok: connection.ok, error: connection.error, tools: connection.tools.length } }
        },
    }),
    defineTool({
        name: "update_mcp_server",
        group: "mcps",
        label: "Editar MCP",
        risk: "destructive",
        description: "Edita um MCP: só os campos informados mudam. Em headers/env, a lista informada é a final; valor omitido mantém o salvo.",
        input: updateInput,
        summarize: (input) => `Editar o MCP ${input.name ?? input.id}`,
        redact: (input) => ({ ...input, headers: redactEntries(input.headers), env: redactEntries(input.env) }),
        execute: async (input, context) => serverOut(await updateMcpServer(input.id, updatedInput(await getMcpServer(input.id), input), context.actorId)),
    }),
    defineTool({
        name: "set_mcp_server_enabled",
        group: "mcps",
        label: "Habilitar/desabilitar MCP",
        risk: "write",
        description: "Habilita ou desabilita um MCP sem excluí-lo (desabilitado, as ferramentas dele saem do agente e do portal).",
        input: z.object({ id: mcpId, enabled: z.boolean() }),
        summarize: (input) => `${input.enabled ? "Habilitar" : "Desabilitar"} o MCP`,
        execute: async ({ id, enabled }, context) => serverOut(await setMcpServerEnabled(id, enabled, context.actorId)),
    }),
    defineTool({
        name: "set_mcp_tool_confirmation",
        group: "mcps",
        label: "Confirmação de ferramenta de MCP",
        risk: "write",
        confirmByDefault: true,
        description: "Define se uma ferramenta de um MCP pede Confirmar/Cancelar no chat antes de executar. `confirms: null` volta ao padrão (só as de leitura não pedem).",
        input: z.object({ id: mcpId, tool: z.string().describe("Nome original da ferramenta no MCP (de get_mcp_server)"), confirms: z.boolean().nullable() }),
        summarize: (input) => (input.confirms === null ? `Voltar ao padrão a confirmação de ${input.tool}` : `${input.confirms ? "Pedir" : "Não pedir"} confirmação em ${input.tool}`),
        execute: async ({ id, tool, confirms }, context) => serverOut(await setMcpToolConfirmation(id, tool, confirms, context.actorId)),
    }),
    defineTool({
        name: "delete_mcp_server",
        group: "mcps",
        label: "Excluir MCP",
        risk: "destructive",
        description: "Exclui um MCP (e o retira dos clientes que o tinham liberado).",
        input: z.object({ id: mcpId }),
        summarize: () => "Excluir o MCP",
        execute: async ({ id }, context) => deleteMcpServer(id, context.actorId),
    }),
    defineTool({
        name: "set_client_mcp_access",
        group: "mcps",
        label: "Liberar MCP a um cliente",
        risk: "destructive",
        description: "Libera ou retira um MCP do Agente Opex do portal de um cliente (os usuários do cliente passam a usar as ferramentas do MCP com as credenciais cadastradas).",
        input: z.object({ clientId: z.string().regex(/^[a-f0-9]{24}$/i).describe("Id do cliente (de list_clients)"), mcpServerId: mcpId, enabled: z.boolean() }),
        summarize: (input) => `${input.enabled ? "Liberar" : "Retirar"} o MCP ${input.enabled ? "para" : "do"} cliente`,
        execute: async ({ clientId, mcpServerId, enabled }, context) => setClientMcpAccess(clientId, mcpServerId, enabled, context.actorId),
    }),
]
