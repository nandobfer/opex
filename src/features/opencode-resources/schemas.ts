import { z } from "zod"
import { CREATABLE_KINDS, GLOBAL_SCOPE, INSTALLABLE_KINDS, OPENCODE_RESOURCE_KINDS, RESOURCE_NAME_PATTERN } from "./constants"

/**
 * Schemas Zod dos recursos do OpenCode — os mesmos na tela, nas rotas e nas ferramentas do Agente Opex.
 * Módulo puro.
 */

export const resourceKindSchema = z.enum(OPENCODE_RESOURCE_KINDS)
export const creatableKindSchema = z.enum(CREATABLE_KINDS)
export const installableKindSchema = z.enum(INSTALLABLE_KINDS)

export const resourceNameSchema = z
    .string()
    .trim()
    .regex(RESOURCE_NAME_PATTERN, "Nome inválido: use letras minúsculas, números, '-', '_' ou '.' (até 64 caracteres)")

/** `global` ou `central:<id>`. */
export const scopeIdSchema = z
    .string()
    .trim()
    .refine((value) => value === GLOBAL_SCOPE || /^central:[a-f0-9]{24}$/i.test(value), "Escopo inválido: use 'global' ou o id de um projeto (list_opencode_scopes)")

const optionalText = (max: number) => z.string().trim().max(max).optional()

/** Frontmatter do `SKILL.md`. O `name` precisa ser igual ao nome da pasta (conferido no serviço). */
export const skillFrontmatterSchema = z
    .object({
        name: resourceNameSchema,
        description: z.string().trim().min(1, "Informe a descrição da skill").max(1024, "Descrição: máximo de 1024 caracteres"),
    })
    .passthrough()

/** Frontmatter de um agente em Markdown (o corpo é o prompt de sistema). */
export const agentFrontmatterSchema = z
    .object({
        description: optionalText(1000),
        mode: z.enum(["primary", "subagent", "all"], { message: "Modo inválido: primary, subagent ou all" }).optional(),
        model: optionalText(200),
        temperature: z.number().min(0).max(2).optional(),
        steps: z.number().int().min(1).max(10_000).optional(),
        hidden: z.boolean().optional(),
        color: optionalText(40),
    })
    .passthrough()

/** Frontmatter de um comando em Markdown (o corpo é o template). */
export const commandFrontmatterSchema = z
    .object({
        description: optionalText(1000),
        agent: optionalText(120),
        model: optionalText(200),
        subtask: z.boolean().optional(),
    })
    .passthrough()

/** Agente definido no JSON da configuração (`agents.<nome>`). */
export const agentConfigSchema = z
    .object({
        description: optionalText(1000),
        mode: z.enum(["primary", "subagent", "all"]).optional(),
        model: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
        system: z.string().max(200_000).optional(),
        prompt: z.string().max(200_000).optional(),
        steps: z.number().int().min(1).optional(),
        hidden: z.boolean().optional(),
        disabled: z.boolean().optional(),
    })
    .passthrough()

/** Comando definido no JSON da configuração (`commands.<nome>`). */
export const commandConfigSchema = z
    .object({
        template: z.string().min(1, "Informe o template do comando").max(200_000),
        description: optionalText(1000),
        agent: optionalText(120),
        model: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
        subtask: z.boolean().optional(),
    })
    .passthrough()

const timeoutSchema = z
    .object({ startup: z.number().int().positive().optional(), catalog: z.number().int().positive().optional(), execution: z.number().int().positive().optional() })
    .strict()
    .optional()

/** Configuração de um MCP SEM os valores de ambiente/cabeçalhos (que vão por `mcpSecretsSchema`). */
export const mcpConfigSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("local"),
        command: z.array(z.string().min(1, "Parte do comando vazia").max(2000)).min(1, "Informe o comando do MCP").max(64),
        cwd: z.string().trim().max(1000).optional(),
        disabled: z.boolean().optional(),
        timeout: timeoutSchema,
    }),
    z.object({
        type: z.literal("remote"),
        url: z.string().trim().url("URL inválida"),
        disabled: z.boolean().optional(),
        timeout: timeoutSchema,
    }),
])
export type McpConfigInput = z.infer<typeof mcpConfigSchema>

export const secretKeySchema = z
    .string()
    .trim()
    .regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/, "Nome de variável/cabeçalho inválido")

/** Alteração de um segredo: `value` ausente mantém, `null` remove, texto grava. */
export const secretPatchSchema = z.object({ key: secretKeySchema, value: z.string().max(4000).nullable().optional() })
export type SecretPatch = z.infer<typeof secretPatchSchema>

export const mcpSecretsSchema = z.object({
    environment: z.array(secretPatchSchema).max(64).optional(),
    headers: z.array(secretPatchSchema).max(64).optional(),
})
export type McpSecretsInput = z.infer<typeof mcpSecretsSchema>

/** Conteúdo de um recurso: Markdown (`frontmatter` + `body`), JSON do config (`config`) ou MCP (`mcp` + `secrets`). */
export const resourceContentSchema = z.object({
    frontmatter: z.record(z.string(), z.unknown()).optional(),
    body: z.string().max(200_000).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    mcp: mcpConfigSchema.optional(),
    secrets: mcpSecretsSchema.optional(),
})
export type ResourceContentInput = z.infer<typeof resourceContentSchema>

export const resourceCreateSchema = resourceContentSchema.extend({
    kind: creatableKindSchema,
    scope: scopeIdSchema,
    name: resourceNameSchema,
})
export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>

export const resourceUpdateSchema = resourceContentSchema
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>

export const resourceToggleSchema = z.object({ enabled: z.boolean() })

export const resourceInstallSchema = z.object({
    kind: installableKindSchema,
    scope: scopeIdSchema,
    /** Skill: `dono/repo` ou URL; plugin: pacote npm (`nome`, `nome@versão`) ou `github:dono/repo`; MCP: pacote npm ou `github:dono/repo`. */
    source: z.string().trim().min(1, "Informe a origem (repositório ou pacote)").max(300).regex(/^[A-Za-z0-9@:/._#+~-]+$/, "Origem inválida: sem espaços nem caracteres especiais"),
    /** Skills do repositório a instalar (vazio = todas). */
    skills: z.array(resourceNameSchema).max(50).optional(),
    /** MCP: nome do servidor (padrão: derivado do pacote). */
    name: resourceNameSchema.optional(),
    /** MCP: variáveis de ambiente (valores são segredos). */
    secrets: mcpSecretsSchema.optional(),
})
export type ResourceInstallInput = z.infer<typeof resourceInstallSchema>

export const resourceUpdateManySchema = z
    .object({ ids: z.array(z.string().min(1).max(500)).max(200).optional(), all: z.boolean().optional() })
    .refine((value) => value.all === true || (value.ids?.length ?? 0) > 0, "Informe os itens a atualizar ou all: true")
export type ResourceUpdateManyInput = z.infer<typeof resourceUpdateManySchema>

export const scopeQuerySchema = z.object({ scope: scopeIdSchema.default(GLOBAL_SCOPE) })
