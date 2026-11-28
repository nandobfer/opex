import { z } from "zod"
import { hexColorSchema } from "@/lib/colors"
import { agentConfigSchema } from "@/features/agentic/schemas"
import { BOOTSTRAP_TIMEOUT_DEFAULT, BOOTSTRAP_TIMEOUT_MAX, BOOTSTRAP_TIMEOUT_MIN, DEFAULT_PROJECT_BOOTSTRAP_INSTRUCTIONS, DEFAULT_PROJECT_BOOTSTRAP_ENVIRONMENT_SKILLS, DEFAULT_PROJECT_BOOTSTRAP_SKILLS } from "./constants"
import { REPO_NAME_MESSAGE, REPO_OWNER_MESSAGE, isValidRepoName, isValidRepoOwner } from "./repo-name"

/** Configuração do Agente de Bootstrap (provedor fixo: OpenCode no host) — mesmo schema na tela e na API. */
export const projectBootstrapSettingsSchema = z
    .object({
        enabled: z.boolean(),
        agent: agentConfigSchema,
        timeoutMinutes: z.number({ error: "Informe o tempo" }).int("Use minutos inteiros").min(BOOTSTRAP_TIMEOUT_MIN, `Mínimo ${BOOTSTRAP_TIMEOUT_MIN} minutos`).max(BOOTSTRAP_TIMEOUT_MAX, `Máximo ${BOOTSTRAP_TIMEOUT_MAX} minutos`),
        instructions: z.string().trim().max(8000, "Até 8.000 caracteres"),
        /** Skills do OpenCode do host liberadas na sessão (id ou nome). */
        skills: z.array(z.string().trim().min(1).max(120)).max(20, "Até 20 skills"),
        /** Das escolhidas, as que só valem com ambiente (sem ambiente não são exigidas, ativadas nem liberadas). */
        environmentSkills: z.array(z.string().trim().min(1).max(120)).max(20, "Até 20 skills"),
    })
    .superRefine((value, ctx) => {
        if (value.enabled && !value.agent.model) ctx.addIssue({ code: "custom", path: ["agent", "model"], message: "Selecione o modelo" })
    })
export type ProjectBootstrapSettings = z.infer<typeof projectBootstrapSettingsSchema>

export const DEFAULT_PROJECT_BOOTSTRAP_SETTINGS: ProjectBootstrapSettings = {
    enabled: false,
    agent: { agent: null, model: null, variant: null, fallbacks: [] },
    timeoutMinutes: BOOTSTRAP_TIMEOUT_DEFAULT,
    instructions: DEFAULT_PROJECT_BOOTSTRAP_INSTRUCTIONS,
    skills: [...DEFAULT_PROJECT_BOOTSTRAP_SKILLS],
    environmentSkills: [...DEFAULT_PROJECT_BOOTSTRAP_ENVIRONMENT_SKILLS],
}

/** Caminho absoluto seguro no host (sem `..`, sem `~` e sem espaços). */
export const hostDirectorySchema = z
    .string()
    .trim()
    .min(2, "Informe o diretório")
    .max(400, "Até 400 caracteres")
    .regex(/^\/(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.@+\-/]+$/, "Use um caminho absoluto, sem espaços nem \"..\" (ex.: /home/usuario/code/projeto)")
    .transform((value) => value.replace(/\/+$/, "") || "/")

export const repoOwnerSchema = z.string().trim().min(1, "Escolha o dono do repositório").max(39).refine(isValidRepoOwner, REPO_OWNER_MESSAGE)
export const repoNameSchema = z.string().trim().min(1, "Informe o nome do repositório").max(100, "Até 100 caracteres").refine(isValidRepoName, REPO_NAME_MESSAGE)

/** Etapa 1 (envio ao agente): o servidor confere tudo de novo antes de começar. */
export const projectBootstrapStartSchema = z.object({
    owner: repoOwnerSchema,
    name: repoNameSchema,
    visibility: z.enum(["private", "public"]),
    context: z.string().trim().min(1, "Descreva o projeto: objetivo e stack").max(20_000, "Até 20.000 caracteres"),
    directory: hostDirectorySchema,
    entryColumnKey: z.string().trim().min(1, "Escolha a coluna de entrada"),
    closedColumnKey: z.string().trim().min(1).nullable(),
    /** Criar ambiente e container Docker (etapa 4). Desligado: projetos que não rodam em container (bibliotecas, plugins, CLIs). */
    withEnvironment: z.boolean().default(true),
})
export type ProjectBootstrapStartInput = z.input<typeof projectBootstrapStartSchema>
export type ProjectBootstrapStartValues = z.output<typeof projectBootstrapStartSchema>

export const repoCheckQuerySchema = z.object({ owner: repoOwnerSchema, name: repoNameSchema, visibility: z.enum(["private", "public"]).optional() })
export const directoryCheckQuerySchema = z.object({ path: hostDirectorySchema, repo: z.string().trim().min(3).max(140) })

/** Ligar ou desligar o ambiente e deploy de um bootstrap aberto. */
export const projectBootstrapEnvironmentSchema = z.object({ enabled: z.boolean() })

/** Mensagem do dono para o agente (resposta em texto, nova tentativa ou durante a execução). */
export const projectBootstrapMessageSchema = z.object({ text: z.string().trim().min(1, "Escreva a mensagem").max(20_000, "Até 20.000 caracteres") })

// ── Catálogo de tecnologias ───────────────────────────────────────────────────

export const techGroupInputSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome do grupo").max(40, "Até 40 caracteres"),
    color: hexColorSchema,
})
export type TechGroupInput = z.infer<typeof techGroupInputSchema>

const alias = z.string().trim().min(1).max(40, "Variante com até 40 caracteres")

export const technologyInputSchema = z
    .object({
        name: z.string().trim().min(1, "Informe o nome").max(60, "Até 60 caracteres"),
        /** Variantes reconhecidas no texto (o nome também é reconhecido). */
        aliases: z.array(alias).max(30, "Até 30 variantes"),
        groupId: z.string().trim().regex(/^[a-f0-9]{24}$/i, "Escolha o grupo"),
    })
    .superRefine((value, ctx) => {
        const keys = value.aliases.map((item) => item.toLowerCase())
        if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["aliases"], message: "Variantes repetidas" })
    })
export type TechnologyInput = z.infer<typeof technologyInputSchema>

// ── Resumo final do agente ────────────────────────────────────────────────────

/** `port` e `healthPath` só são exigidos com ambiente (`parseBootstrapResult` aplica a exigência). */
export const bootstrapResultSchema = z.object({
    port: z.number().int().min(1024).max(65535).nullable().optional(),
    healthPath: z.string().trim().min(1).max(200).regex(/^\//, "O caminho começa com /").nullable().optional(),
    hasServer: z.boolean(),
    usesMongo: z.boolean(),
    branch: z.string().trim().min(1).max(200).regex(/^(?!-)(?!.*\.\.)[A-Za-z0-9_./@+-]+$/),
})
export type BootstrapResult = z.infer<typeof bootstrapResultSchema>
