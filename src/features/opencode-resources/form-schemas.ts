import { z } from "zod"
import { joinCommand, splitCommand } from "./logic"
import type { McpDetailDto } from "./types"
import { agentConfigSchema, agentFrontmatterSchema, commandConfigSchema, MCP_AUTH_MODES, mcpConfigSchema, mcpOauthConfigSchema, resourceNameSchema, secretKeySchema, skillFrontmatterSchema, installSourceSchema, type ResourceContentInput } from "./schemas"

/**
 * Schemas dos formulários da tela — montados a partir dos MESMOS schemas da API (`schemas.ts`), para a
 * validação em tempo real bater com a do servidor. Módulo puro.
 */

const optionalName = z.union([z.literal(""), resourceNameSchema])
const text = (max: number) => z.string().trim().max(max)

/** Formulário de skill/agente/comando em arquivo (campos comuns; regras por tipo no `superRefine`). */
export const markdownFormBase = z.object({
    name: resourceNameSchema,
    description: text(1024),
    mode: z.union([z.literal(""), agentFrontmatterSchema.shape.mode.unwrap()]),
    model: text(200),
    agent: text(120),
    subtask: z.boolean(),
    body: z.string().max(200_000),
})
export type MarkdownFormValues = z.infer<typeof markdownFormBase>

export function markdownFormSchema(kind: "skill" | "agent" | "command") {
    return markdownFormBase.superRefine((value, ctx) => {
        if (kind === "skill") {
            const description = skillFrontmatterSchema.shape.description.safeParse(value.description)
            if (!description.success) ctx.addIssue({ code: "custom", path: ["description"], message: description.error.issues[0]?.message ?? "Descrição inválida" })
            if (!value.body.trim()) ctx.addIssue({ code: "custom", path: ["body"], message: "Informe as instruções da skill" })
        }
        if (kind === "agent" && value.description.length > 1000) ctx.addIssue({ code: "custom", path: ["description"], message: "Descrição: máximo de 1000 caracteres" })
        if (kind === "command" && !value.body.trim()) ctx.addIssue({ code: "custom", path: ["body"], message: "Informe o template do comando" })
    })
}

/** Campos do formulário que viram chaves do frontmatter, por tipo. */
const FRONTMATTER_FIELDS = { skill: ["description"], agent: ["description", "mode", "model"], command: ["description", "agent", "model", "subtask"] } as const

/** Monta o frontmatter: chaves extras preservadas + campos do formulário (vazios saem). */
export function toFrontmatter(kind: "skill" | "agent" | "command", values: MarkdownFormValues, extras: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...extras }
    for (const field of FRONTMATTER_FIELDS[kind]) {
        const value = values[field]
        if (value === "" || value === false) delete out[field]
        else out[field] = value
    }
    return out
}

/** Valores do formulário a partir do frontmatter salvo (+ as chaves extras, que voltam intactas). */
export function fromFrontmatter(kind: "skill" | "agent" | "command", name: string, frontmatter: Record<string, unknown>, body: string): { values: MarkdownFormValues; extras: Record<string, unknown> } {
    const str = (value: unknown) => (typeof value === "string" ? value : "")
    const mode = str(frontmatter.mode)
    const values: MarkdownFormValues = {
        name,
        description: str(frontmatter.description),
        mode: mode === "primary" || mode === "subagent" || mode === "all" ? mode : "",
        model: str(frontmatter.model),
        agent: str(frontmatter.agent),
        subtask: frontmatter.subtask === true,
        body,
    }
    const managed = new Set<string>([...FRONTMATTER_FIELDS[kind], "name"])
    const extras = Object.fromEntries(Object.entries(frontmatter).filter(([key]) => !managed.has(key)))
    return { values, extras }
}

/** Item definido no JSON da configuração: o objeto inteiro como texto, validado pelo schema do tipo. */
export function jsonFormSchema(kind: "agent" | "command") {
    const schema = kind === "agent" ? agentConfigSchema : commandConfigSchema
    return z.object({
        json: z.string().superRefine((value, ctx) => {
            let parsed: unknown
            try {
                parsed = JSON.parse(value)
            } catch (error) {
                ctx.addIssue({ code: "custom", message: `JSON inválido: ${error instanceof Error ? error.message : String(error)}` })
                return
            }
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                ctx.addIssue({ code: "custom", message: "O JSON precisa ser um objeto" })
                return
            }
            const result = schema.safeParse(parsed)
            if (!result.success) {
                const issue = result.error.issues[0]
                ctx.addIssue({ code: "custom", message: `${issue?.path.join(".") || "(raiz)"}: ${issue?.message ?? "inválido"}` })
            }
        }),
    })
}
export type JsonFormValues = { json: string }

const secretRow = z.object({
    key: secretKeySchema,
    /** Vazio em uma chave existente = mantém o valor atual. */
    value: z.string().max(4000),
    existing: z.boolean(),
})
export type SecretRowValues = z.infer<typeof secretRow>

const uniqueKeys = (rows: readonly { key: string }[]) => new Set(rows.map((row) => row.key)).size === rows.length

export const mcpFormSchema = z
    .object({
        name: resourceNameSchema,
        type: z.enum(["local", "remote"]),
        command: z.string().max(4000),
        url: z.string().trim().max(2000),
        cwd: z.string().trim().max(1000),
        disabled: z.boolean(),
        environment: z.array(secretRow).max(64).refine(uniqueKeys, "Variáveis repetidas"),
        headers: z.array(secretRow).max(64).refine(uniqueKeys, "Cabeçalhos repetidos"),
        /** MCP remoto (OPE-176): nenhuma, cabeçalhos ou OAuth. */
        auth: z.enum(MCP_AUTH_MODES),
        oauthClientId: text(500),
        /** Vazio mantém o salvo (`oauthClientSecretSaved`). */
        oauthClientSecret: z.string().max(4000),
        oauthClientSecretSaved: z.boolean(),
        oauthScope: text(1000),
        oauthCallbackPort: z.string().trim().regex(/^\d{0,5}$/, "Porta inválida"),
        oauthRedirectUri: text(2000),
        oauthAuthServerMetadataUrl: text(2000),
        disableAutoOauth: z.boolean(),
    })
    .superRefine((value, ctx) => {
        const config = value.type === "local" ? { type: "local" as const, command: splitCommand(value.command), cwd: value.cwd || undefined, disabled: value.disabled } : { type: "remote" as const, url: value.url, disabled: value.disabled }
        const result = mcpConfigSchema.safeParse(config)
        if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: [value.type === "local" ? (issue.path[0] === "cwd" ? "cwd" : "command") : "url"], message: issue.message })
        if (value.type === "remote" && value.auth === "oauth") {
            const oauth = mcpOauthConfigSchema.safeParse(oauthConfigOf(value))
            const fields = { clientId: "oauthClientId", scope: "oauthScope", callbackPort: "oauthCallbackPort", redirectUri: "oauthRedirectUri", authServerMetadataUrl: "oauthAuthServerMetadataUrl" } as const
            if (!oauth.success) for (const issue of oauth.error.issues) ctx.addIssue({ code: "custom", path: [fields[issue.path[0] as keyof typeof fields] ?? "oauthClientId"], message: issue.message })
        }
        if (value.type === "remote" && value.auth !== "headers") return
        const rows = value.type === "local" ? value.environment : value.headers
        rows.forEach((row, index) => {
            if (!row.existing && !row.value) ctx.addIssue({ code: "custom", path: [value.type === "local" ? "environment" : "headers", index, "value"], message: "Informe o valor" })
        })
    })
export type McpFormValues = z.infer<typeof mcpFormSchema>

/** Campos OAuth do formulário → chave `oauth` da API (vazio = padrão do OpenCode). */
function oauthConfigOf(values: Pick<McpFormValues, "oauthClientId" | "oauthScope" | "oauthCallbackPort" | "oauthRedirectUri" | "oauthAuthServerMetadataUrl">) {
    const port = values.oauthCallbackPort.trim()
    return {
        ...(values.oauthClientId.trim() ? { clientId: values.oauthClientId.trim() } : {}),
        ...(values.oauthScope.trim() ? { scope: values.oauthScope.trim() } : {}),
        ...(port ? { callbackPort: Number(port) } : {}),
        ...(values.oauthRedirectUri.trim() ? { redirectUri: values.oauthRedirectUri.trim() } : {}),
        ...(values.oauthAuthServerMetadataUrl.trim() ? { authServerMetadataUrl: values.oauthAuthServerMetadataUrl.trim() } : {}),
    }
}

const EMPTY_AUTH = {
    auth: "none" as const,
    oauthClientId: "",
    oauthClientSecret: "",
    oauthClientSecretSaved: false,
    oauthScope: "",
    oauthCallbackPort: "",
    oauthRedirectUri: "",
    oauthAuthServerMetadataUrl: "",
    disableAutoOauth: false,
}

export const installFormSchema = z.object({
    source: installSourceSchema,
    skills: z.array(resourceNameSchema).max(50),
    name: optionalName,
})
export type InstallFormValues = z.infer<typeof installFormSchema>

/** Valores do formulário de MCP a partir do detalhe (segredos só pelo nome, valor vazio = manter). */
export function mcpFormFromDetail(name: string, detail: McpDetailDto | null): McpFormValues {
    if (!detail) return { name, type: "local", command: "", url: "", cwd: "", disabled: false, environment: [], headers: [], ...EMPTY_AUTH }
    const oauth = detail.oauth || null
    return {
        auth: detail.auth ?? (detail.type === "remote" && detail.headerKeys.length ? "headers" : "none"),
        oauthClientId: oauth?.clientId ?? "",
        oauthClientSecret: "",
        oauthClientSecretSaved: oauth?.hasClientSecret ?? false,
        oauthScope: oauth?.scope ?? "",
        oauthCallbackPort: oauth?.callbackPort ? String(oauth.callbackPort) : "",
        oauthRedirectUri: oauth?.redirectUri ?? "",
        oauthAuthServerMetadataUrl: oauth?.authServerMetadataUrl ?? "",
        disableAutoOauth: detail.oauth === false,
        name,
        type: detail.type,
        command: joinCommand(detail.command ?? []),
        url: detail.url ?? "",
        cwd: detail.cwd ?? "",
        disabled: detail.disabled,
        environment: detail.environmentKeys.map((key) => ({ key, value: "", existing: true })),
        headers: detail.headerKeys.map((key) => ({ key, value: "", existing: true })),
    }
}

/** Conteúdo enviado à API: configuração sem segredos + a lista completa de segredos (vazio = manter). */
export function mcpContentFromForm(values: McpFormValues): Pick<ResourceContentInput, "mcp" | "secrets"> {
    const toPatch = (rows: readonly SecretRowValues[]) => rows.map((row) => (row.value ? { key: row.key, value: row.value } : { key: row.key }))
    if (values.type === "local")
        return { mcp: { type: "local", command: splitCommand(values.command), cwd: values.cwd || undefined, disabled: values.disabled }, secrets: { environment: toPatch(values.environment) } }
    const oauth = values.auth === "oauth"
    const clientId = values.oauthClientId.trim()
    const oauthClientSecret = !oauth ? undefined : !clientId ? null : values.oauthClientSecret ? values.oauthClientSecret : values.oauthClientSecretSaved ? undefined : null
    return {
        mcp: {
            type: "remote",
            url: values.url.trim(),
            disabled: values.disabled,
            auth: values.auth,
            ...(oauth ? { oauth: oauthConfigOf(values) } : { disableAutoOauth: values.disableAutoOauth }),
        },
        secrets: { headers: values.auth === "headers" ? toPatch(values.headers) : [], ...(oauthClientSecret !== undefined ? { oauthClientSecret } : {}) },
    }
}
