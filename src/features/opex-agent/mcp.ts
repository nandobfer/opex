import { z } from "zod"
import type { OpexToolRisk } from "./tool-tree"

/**
 * MCPs (servidores Model Context Protocol) do Agente Opex — módulo puro (tela e servidor).
 * Cada MCP habilitado é conectado no início do turno e as ferramentas dele entram para o agente com o
 * nome `mcp_{identificador}_{ferramenta}`. Ver `aicontext/modules/opex-agent.md`, "MCPs".
 */

/** Grupo das ferramentas vindas dos MCPs (fora da árvore de Ferramentas: são configuradas na seção MCPs). */
export const OPEX_MCP_TOOL_GROUP = "mcp" as const
export const OPEX_MCP_TOOL_PREFIX = "mcp_"
/** Evento em `private-app` quando um MCP muda (payload `{ id }`). */
export const OPEX_MCP_EVENT = "opex-mcp-updated"
export const OPEX_MCP_AUDIT_ENTITY = "McpServidor"
export const OPEX_MCP_SECRETS_MAX = 30
export const OPEX_MCP_ARGS_MAX = 50
/** Limite de tempo para conectar (o stdio pode baixar o pacote pelo npx na primeira vez). */
export const OPEX_MCP_CONNECT_TIMEOUT_MS = { http: 10_000, sse: 10_000, stdio: 30_000 } as const
export const OPEX_MCP_CALL_TIMEOUT_MS = 120_000
/** Nome de ferramenta aceito pelos provedores. */
export const OPEX_TOOL_NAME_MAX = 64

export const OPEX_MCP_TRANSPORTS = ["http", "sse", "stdio"] as const
export type OpexMcpTransport = (typeof OPEX_MCP_TRANSPORTS)[number]

export const OPEX_MCP_TRANSPORT_LABELS: Record<OpexMcpTransport, string> = {
    http: "HTTP",
    sse: "SSE",
    stdio: "stdio",
}

export const OPEX_MCP_SLUG_PATTERN = /^[a-z0-9_]{2,24}$/
const SECRET_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/
const URL_PATTERN = /^https?:\/\/[^\s]+$/i

/**
 * Header (HTTP/SSE) ou variável de ambiente (stdio) com valor secreto. A lista é o conjunto final de
 * chaves: `value` preenchido grava um valor novo; vazio mantém o valor já salvo da mesma chave; chave
 * fora da lista é removida. O valor salvo nunca volta para a tela.
 */
export const opexMcpSecretEntrySchema = z.object({
    // Nome obrigatório e formato conferidos só na lista do transporte ativo (`refineConnection`): a
    // lista do outro transporte fica fora da tela e é descartada ao salvar.
    key: z.string().trim().max(128, "Máximo de 128 caracteres"),
    value: z.string().max(8000, "Máximo de 8000 caracteres"),
})
export type OpexMcpSecretEntry = z.infer<typeof opexMcpSecretEntrySchema>

export const opexMcpToolAnnotationsSchema = z.object({
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
})
export type OpexMcpToolAnnotations = z.infer<typeof opexMcpToolAnnotationsSchema>

/** Ferramenta descoberta no MCP (retrato do último teste/conexão). */
export const opexMcpToolInfoSchema = z.object({
    name: z.string().min(1).max(200),
    title: z.string().max(200).nullable(),
    description: z.string().max(4000),
    annotations: opexMcpToolAnnotationsSchema,
})
export type OpexMcpToolInfo = z.infer<typeof opexMcpToolInfoSchema>

const connectionShape = {
    transport: z.enum(OPEX_MCP_TRANSPORTS),
    url: z.string().trim().max(2000, "Máximo de 2000 caracteres"),
    command: z.string().trim().max(500, "Máximo de 500 caracteres"),
    args: z.array(z.string().max(1000, "Argumento com mais de 1000 caracteres")).max(OPEX_MCP_ARGS_MAX, `Até ${OPEX_MCP_ARGS_MAX} argumentos`),
    headers: z.array(opexMcpSecretEntrySchema).max(OPEX_MCP_SECRETS_MAX, `Até ${OPEX_MCP_SECRETS_MAX} headers`),
    env: z.array(opexMcpSecretEntrySchema).max(OPEX_MCP_SECRETS_MAX, `Até ${OPEX_MCP_SECRETS_MAX} variáveis`),
}

type ConnectionValues = { transport: OpexMcpTransport; url: string; command: string; headers: OpexMcpSecretEntry[]; env: OpexMcpSecretEntry[] }

/** Lista de segredos usada pelo transporte (a outra é ignorada e descartada ao salvar). */
export function activeSecretList(transport: OpexMcpTransport): "headers" | "env" {
    return transport === "stdio" ? "env" : "headers"
}

function refineConnection(value: ConnectionValues, ctx: z.RefinementCtx): void {
    if (value.transport === "stdio") {
        if (!value.command) ctx.addIssue({ code: "custom", path: ["command"], message: "Informe o comando (ex.: npx)" })
    } else if (!URL_PATTERN.test(value.url)) {
        ctx.addIssue({ code: "custom", path: ["url"], message: "Informe uma URL http(s) válida" })
    }
    const field = activeSecretList(value.transport)
    const seen = new Set<string>()
    value[field].forEach((entry, index) => {
        const path = [field, index, "key"]
        if (!entry.key) ctx.addIssue({ code: "custom", path, message: "Informe o nome" })
        else if (!SECRET_KEY_PATTERN.test(entry.key)) ctx.addIssue({ code: "custom", path, message: "Use letras, números, _ . ou -" })
        else if (seen.has(entry.key)) ctx.addIssue({ code: "custom", path, message: "Nome repetido" })
        seen.add(entry.key)
    })
}

/** Cadastro/edição de um MCP (mesmo schema na tela e na API). */
export const opexMcpServerInputSchema = z
    .object({
        name: z.string().trim().min(1, "Informe o nome").max(60, "Máximo de 60 caracteres"),
        slug: z.string().trim().regex(OPEX_MCP_SLUG_PATTERN, "Identificador: 2 a 24 caracteres entre a-z, 0-9 e _"),
        description: z.string().trim().max(500, "Máximo de 500 caracteres"),
        enabled: z.boolean(),
        ...connectionShape,
        /** Ajuste de "Pede confirmação" por ferramenta (nome original no MCP); ausente = padrão pela anotação. */
        confirmations: z.record(z.string().max(200), z.boolean()),
        /** Ferramentas do último "Testar conexão" (omitido = mantém o retrato salvo). */
        tools: z.array(opexMcpToolInfoSchema).max(500).optional(),
    })
    .superRefine(refineConnection)
export type OpexMcpServerInput = z.infer<typeof opexMcpServerInputSchema>

/** "Testar conexão" de um rascunho; com `id`, os segredos vazios usam os valores já salvos. */
export const opexMcpTestInputSchema = z
    .object({ id: z.string().regex(/^[a-f0-9]{24}$/i, "Id inválido").optional(), ...connectionShape })
    .superRefine(refineConnection)
export type OpexMcpTestInput = z.infer<typeof opexMcpTestInputSchema>

export const opexMcpEnabledSchema = z.object({ enabled: z.boolean() })

export const EMPTY_OPEX_MCP_INPUT: OpexMcpServerInput = {
    name: "",
    slug: "",
    description: "",
    enabled: true,
    transport: "http",
    url: "",
    command: "",
    args: [],
    headers: [],
    env: [],
    confirmations: {},
}

/** Sugestão de identificador a partir do nome ("GitHub Issues" → "github_issues"). */
export function slugifyMcpName(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 24)
}

function shortHash(text: string): string {
    let hash = 5381
    for (let index = 0; index < text.length; index++) hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
    return hash.toString(36).slice(0, 6)
}

/** Nome da ferramenta para o modelo: `mcp_{slug}_{ferramenta}`, só `[a-zA-Z0-9_-]` e até 64 caracteres. */
export function mcpToolName(slug: string, tool: string): string {
    const base = `${OPEX_MCP_TOOL_PREFIX}${slug}_${tool.replace(/[^a-zA-Z0-9_-]/g, "_")}`
    if (base.length <= OPEX_TOOL_NAME_MAX) return base
    const suffix = `_${shortHash(tool)}`
    return `${base.slice(0, OPEX_TOOL_NAME_MAX - suffix.length)}${suffix}`
}

/** Nomes de todas as ferramentas de um MCP, sem colisão (nome original → nome do modelo). */
export function mcpToolNames(slug: string, tools: readonly string[]): Map<string, string> {
    const names = new Map<string, string>()
    const used = new Set<string>()
    for (const tool of tools) {
        let name = mcpToolName(slug, tool)
        if (used.has(name)) {
            const suffix = `_${shortHash(`${tool}#${used.size}`)}`
            name = `${name.slice(0, OPEX_TOOL_NAME_MAX - suffix.length)}${suffix}`
        }
        used.add(name)
        names.set(tool, name)
    }
    return names
}

export function isMcpToolName(name: string): boolean {
    return name.startsWith(OPEX_MCP_TOOL_PREFIX)
}

/**
 * Risco pela anotação do servidor (não confiável, só ponto de partida): `readOnlyHint` = leitura;
 * `destructiveHint: false` = altera; sem anotação = destrutiva (o padrão da especificação do MCP).
 */
export function mcpToolRisk(annotations: OpexMcpToolAnnotations | undefined): OpexToolRisk {
    if (annotations?.readOnlyHint) return "read"
    if (annotations?.destructiveHint === false) return "write"
    return "destructive"
}

/** Padrão de "Pede confirmação": só as de leitura não pedem. */
export function defaultMcpToolConfirms(annotations: OpexMcpToolAnnotations | undefined): boolean {
    return mcpToolRisk(annotations) !== "read"
}

export function mcpToolConfirms(tool: Pick<OpexMcpToolInfo, "name" | "annotations">, confirmations: Readonly<Record<string, boolean>>): boolean {
    const override = confirmations[tool.name]
    return typeof override === "boolean" ? override : defaultMcpToolConfirms(tool.annotations)
}

/** Ajuste depois de trocar o switch: igual ao padrão, o ajuste some. */
export function nextMcpConfirmations(confirmations: Readonly<Record<string, boolean>>, tool: Pick<OpexMcpToolInfo, "name" | "annotations">, confirms: boolean): Record<string, boolean> {
    const next = { ...confirmations }
    if (confirms === defaultMcpToolConfirms(tool.annotations)) delete next[tool.name]
    else next[tool.name] = confirms
    return next
}

/** Endereço sem credenciais nem query (auditoria e logs). */
export function safeMcpUrl(url: string): string {
    try {
        const parsed = new URL(url)
        return `${parsed.origin}${parsed.pathname}`
    } catch {
        return ""
    }
}

/**
 * JSON Schema da ferramenta pronto para os provedores: objeto na raiz, sem `$schema` (o Gemini recusa
 * algumas chaves de metadados).
 */
export function cleanMcpInputSchema(schema: unknown): Record<string, unknown> {
    const strip = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(strip)
        if (!value || typeof value !== "object") return value
        const out: Record<string, unknown> = {}
        for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
            if (key === "$schema" || key === "$id") continue
            out[key] = strip(inner)
        }
        return out
    }
    const base = schema && typeof schema === "object" && !Array.isArray(schema) ? (strip(schema) as Record<string, unknown>) : {}
    return { ...base, type: "object", properties: base.properties && typeof base.properties === "object" ? base.properties : {} }
}

/** Header/variável salva: só a chave volta para a tela. */
export interface OpexMcpSecretStateDto {
    key: string
    configured: boolean
}

export interface OpexMcpServerDto {
    id: string
    name: string
    slug: string
    description: string
    enabled: boolean
    transport: OpexMcpTransport
    url: string
    command: string
    args: string[]
    headers: OpexMcpSecretStateDto[]
    env: OpexMcpSecretStateDto[]
    confirmations: Record<string, boolean>
    tools: OpexMcpToolInfo[]
    toolsSyncedAt: string | null
    lastError: string | null
    lastCheckedAt: string | null
    /** Clientes do portal com o MCP liberado. */
    clientCount: number
    createdAt: string
    updatedAt: string
}

export interface OpexMcpTestResultDto {
    ok: boolean
    tools: OpexMcpToolInfo[]
    error: string | null
    durationMs: number
    /** Nome e versão informados pelo servidor. */
    serverInfo: string | null
}

/** Valores do formulário a partir de um MCP salvo (segredos vazios = manter). */
export function mcpServerToInput(server: OpexMcpServerDto): OpexMcpServerInput {
    return {
        name: server.name,
        slug: server.slug,
        description: server.description,
        enabled: server.enabled,
        transport: server.transport,
        url: server.url,
        command: server.command,
        args: server.args,
        headers: server.headers.map((entry) => ({ key: entry.key, value: "" })),
        env: server.env.map((entry) => ({ key: entry.key, value: "" })),
        confirmations: server.confirmations,
        tools: server.tools,
    }
}
