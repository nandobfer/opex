import { z } from "zod"
import { AGENT_ROLES, PREVIEW_PORT_MAX, PREVIEW_PORT_MIN, type AgentRole } from "./constants"

/** Agente, modelo (`provedor/modelo`) e variante do OpenCode para uma etapa. */
export const agentConfigSchema = z.object({
    agent: z.string().trim().max(100).nullable(),
    model: z.string().trim().max(200).nullable(),
    variant: z.string().trim().max(50).nullable(),
})
export type AgentConfig = z.infer<typeof agentConfigSchema>

const EMPTY_AGENT: AgentConfig = { agent: null, model: null, variant: null }

const agentsShape = Object.fromEntries(AGENT_ROLES.map((role) => [role, agentConfigSchema])) as Record<AgentRole, typeof agentConfigSchema>

/** Configuração geral (aba "Desenvolvimento agêntico"): liga a feature e define os agentes padrão. */
export const agenticSettingsSchema = z.object({
    enabled: z.boolean(),
    agents: z.object(agentsShape),
})
export type AgenticSettings = z.infer<typeof agenticSettingsSchema>

export const DEFAULT_AGENTIC_SETTINGS: AgenticSettings = {
    enabled: false,
    agents: { planning: { ...EMPTY_AGENT, agent: "plan" }, implementation: { ...EMPTY_AGENT, agent: "build" }, build: { ...EMPTY_AGENT, agent: "build" }, pr: { ...EMPTY_AGENT, agent: "build" } },
}

const absolutePath = z
    .string()
    .trim()
    .min(1, "Informe o diretório")
    .max(500, "Até 500 caracteres")
    .refine((value) => value.startsWith("/") || value.startsWith("~"), "Use um caminho absoluto (ex.: /home/usuario/projeto)")
    .transform((value) => (value.length > 1 ? value.replace(/\/+$/, "") : value))

const branch = z
    .string()
    .trim()
    .min(1, "Informe a branch")
    .max(200)
    .regex(/^[A-Za-z0-9._/-]+$/, "Use só letras, números, ponto, hífen, sublinhado e barra")

const optionalText = (max: number) => z.string().trim().max(max, `Até ${max.toLocaleString("pt-BR")} caracteres`)

const nameList = z.array(z.string().trim().min(1).max(100)).max(20)

/** Configuração editável de uma central (mesmo schema na tela e na API). */
export const centralConfigSchema = z.object({
    enabled: z.boolean(),
    sessionDirectory: absolutePath,
    /** Vazio usa `<diretório das sessões>/worktrees`. */
    worktreeRoot: z.union([absolutePath, z.literal("")]),
    maxConcurrent: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Mínimo 1").max(10, "Máximo 10"),
    /** Etapa sem override (`null`) usa o agente padrão da aba. */
    agents: z.object(Object.fromEntries(AGENT_ROLES.map((role) => [role, agentConfigSchema.nullable()])) as Record<AgentRole, z.ZodNullable<typeof agentConfigSchema>>),
    git: z.object({
        baseBranch: branch,
        prTargetBranch: branch,
        branchPattern: z.string().trim().min(1, "Informe o padrão").max(120).refine((value) => value.includes("{code}"), "Inclua {code} no padrão"),
        commitPattern: optionalText(200).min(1, "Informe o padrão"),
        prTitlePattern: optionalText(200).min(1, "Informe o padrão"),
        prDraft: z.boolean(),
        /** Merge automático do PR pelo agente (merge commit + exclusão da branch remota); não combina com PR rascunho. */
        autoMerge: z.boolean(),
        prReviewers: nameList,
        prLabels: nameList,
        setupCommands: optionalText(2000),
        validateCommands: optionalText(2000),
    }),
    environment: z.object({
        previewMethod: z.enum(["local", "github"]).default("local"),
        githubWorkflow: z.string().trim().min(1, "Informe o workflow").max(100).regex(/^[A-Za-z0-9_.-]+\.ya?ml$/, "Informe um arquivo YAML").default("preview.yml"),
        previewService: z.string().trim().min(1, "Informe o serviço").max(80).regex(/^[A-Za-z0-9_-]+$/, "Serviço inválido").default("app"),
        composeFile: optionalText(300),
        portEnvVar: z.string().trim().min(1, "Informe a variável").max(60).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Nome de variável inválido"),
        previewHost: z.string().trim().min(1, "Informe o endereço").max(200).regex(/^[A-Za-z0-9.-]+$/, "Informe só o host (ex.: localhost ou 192.168.0.64)"),
        healthPath: z.string().trim().max(200).regex(/^(\/.*)?$/, "Comece com /"),
        buildTimeoutMinutes: z.number({ error: "Informe um número" }).int().min(2, "Mínimo 2").max(120, "Máximo 120"),
        /** Faixa de portas reservadas às prévias das mesas (min/max inclusive). */
        previewPortMin: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1024, "Mínimo 1024").max(65535, "Máximo 65535"),
        previewPortMax: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1024, "Mínimo 1024").max(65535, "Máximo 65535"),
    }),
    columns: z.object({
        /** Coluna do quadro que, ao receber um card, entra na fila da central e pode abrir a mesa automaticamente; `null` = desligado. */
        queue: z.string().trim().max(60).nullable(),
        /** Coluna de destino ao abrir a mesa (implementação); `null` = não move. */
        onStart: z.string().trim().max(60).nullable(),
        /** Coluna de destino quando o PR é aberto; `null` = não move. */
        onPr: z.string().trim().max(60).nullable(),
        /** Coluna de destino quando o PR é mergeado; `null` = não move. */
        onDone: z.string().trim().max(60).nullable(),
    }),
    cleanup: z.object({
        teardownEnvironment: z.boolean(),
        removeWorktree: z.boolean(),
        deleteBranch: z.boolean(),
    }),
    include: z.object({ comments: z.boolean(), history: z.boolean() }),
    instructions: z.object(Object.fromEntries(AGENT_ROLES.map((role) => [role, optionalText(4000)])) as Record<AgentRole, ReturnType<typeof optionalText>>),
}).superRefine((value, ctx) => {
    if (value.environment.previewPortMin > value.environment.previewPortMax) {
        ctx.addIssue({ code: "custom", path: ["environment", "previewPortMax"], message: "A porta final deve ser maior ou igual à inicial" })
    }
    if (value.git.autoMerge && value.git.prDraft) {
        ctx.addIssue({ code: "custom", path: ["git", "autoMerge"], message: "O merge automático não combina com abrir o PR como rascunho: desligue uma das opções" })
    }
})
export type CentralConfig = z.infer<typeof centralConfigSchema>
export type CentralConfigInput = z.input<typeof centralConfigSchema>

export function defaultCentralConfig(sessionDirectory: string): CentralConfig {
    return {
        enabled: true,
        sessionDirectory,
        worktreeRoot: sessionDirectory === "/" ? "" : `${sessionDirectory.replace(/\/+$/, "")}/worktrees`,
        maxConcurrent: 2,
        agents: { planning: null, implementation: null, build: null, pr: null },
        git: {
            baseBranch: "main",
            prTargetBranch: "main",
            branchPattern: "feat/{code}-{slug}",
            commitPattern: "feat: {title} ({code})",
            prTitlePattern: "{title} ({code})",
            prDraft: false,
            autoMerge: false,
            prReviewers: [],
            prLabels: [],
            setupCommands: "",
            validateCommands: "",
        },
        environment: { previewMethod: "local", githubWorkflow: "preview.yml", previewService: "app", composeFile: "", portEnvVar: "PORT", previewHost: "localhost", healthPath: "/", buildTimeoutMinutes: 20, previewPortMin: PREVIEW_PORT_MIN, previewPortMax: PREVIEW_PORT_MAX },
        columns: { queue: null, onStart: null, onPr: null, onDone: null },
        cleanup: { teardownEnvironment: true, removeWorktree: true, deleteBranch: true },
        include: { comments: true, history: false },
        instructions: { planning: "", implementation: "", build: "", pr: "" },
    }
}

/** Nova central: projeto (repositório vinculado) + diretório das sessões (o resto nasce com os padrões). */
export const createCentralSchema = z.object({
    projectId: z.string().trim().regex(/^[a-f0-9]{24}$/i, "Selecione o produto"),
    projectName: z.string().trim().min(1).max(200),
    sessionDirectory: absolutePath,
})
export type CreateCentralInput = z.infer<typeof createCentralSchema>

/** Texto opcional do usuário (informações adicionais), sem limite de caracteres. */
const optionalUserText = z.string().trim().optional()

/** Texto do usuário enviado ao planejador (correção do plano, da prévia, do PR ou reabertura). */
export const feedbackSchema = z.object({ text: z.string().trim().min(3, "Descreva o que precisa mudar") })
export type FeedbackInput = z.infer<typeof feedbackSchema>

/** Texto opcional anexado a uma ação (ex.: informações adicionais ao aprovar o plano de implementação). */
export const optionalFeedbackSchema = z.object({ text: optionalUserText })
export type OptionalFeedbackInput = z.infer<typeof optionalFeedbackSchema>

export const startWorkbenchSchema = z.object({
    centralId: z.string().regex(/^[a-f0-9]{24}$/i),
    taskId: z.string().regex(/^[a-f0-9]{24}$/i),
    /** Informações adicionais opcionais digitadas ao abrir a mesa; vão no primeiro prompt do planejador. */
    text: optionalUserText,
})

export const permissionReplySchema = z.object({
    decision: z.enum(["once", "always", "reject"]),
    message: z.string().trim().max(2000).optional(),
})
export type PermissionReplyInput = z.infer<typeof permissionReplySchema>

export const formReplySchema = z.object({
    answer: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string().max(500)).max(50)])).optional(),
    cancel: z.boolean().optional(),
})
export type FormReplyInput = z.infer<typeof formReplySchema>

/** Bloco JSON final pedido aos agentes de build, PR e limpeza. */
export const buildResultSchema = z.object({ ok: z.boolean(), error: z.string().optional() })
export const prResultSchema = z.object({ url: z.string().url(), number: z.number().int().positive().optional() })
/** Bloco JSON final do agente de resolução de conflitos: `ok` confirma o push feito no próprio PR. */
export const conflictResultSchema = z.object({ ok: z.boolean(), error: z.string().optional(), sha: z.string().regex(/^[0-9a-f]{7,40}$/i, "SHA inválido").optional() })
