import { z } from "zod"
import { AGENT_ROLES, FORK_DONE_POLICIES, FORK_INTEGRATION_TARGETS, FORK_MODES, PREVIEW_PORT_MAX, PREVIEW_PORT_MIN, WORKBENCH_MODEL_ROLES, type AgentRole } from "./constants"

/** Agente, modelo (`provedor/modelo`) e variante do OpenCode para uma etapa. */
export const agentConfigSchema = z.object({
    agent: z.string().trim().max(100).nullable(),
    model: z.string().trim().max(200).nullable(),
    variant: z.string().trim().max(50).nullable(),
})
export type AgentConfig = z.infer<typeof agentConfigSchema>

const EMPTY_AGENT: AgentConfig = { agent: null, model: null, variant: null }

/** Troca do modelo na mesa ou no fork: `model: null` volta ao modelo do papel. */
export const modelOverrideSchema = z.object({
    model: z.string().trim().min(1, "Informe o modelo").max(200).nullable(),
    variant: z.string().trim().min(1).max(50).nullable().default(null),
})
export type ModelOverrideInput = z.infer<typeof modelOverrideSchema>

/** Troca do modelo de um papel da conversa principal da mesa. */
export const workbenchModelSchema = modelOverrideSchema.extend({
    role: z.enum(WORKBENCH_MODEL_ROLES, { error: "Etapa inválida para trocar o modelo" }),
})
export type WorkbenchModelInput = z.infer<typeof workbenchModelSchema>

const agentsShape = Object.fromEntries(AGENT_ROLES.map((role) => [role, agentConfigSchema])) as Record<AgentRole, typeof agentConfigSchema>

/**
 * Colunas globais (aba "Desenvolvimento agêntico"): o padrão de fila e movimentação de todas as
 * centrais. Uma central pode herdar estes valores ou personalizá-los (`CentralConfig.columns`).
 */
export const agenticColumnsSchema = z.object({
    /** Coluna do quadro que, ao receber um card, entra na fila da central; `null` = desligado. */
    queue: z.string().trim().max(60).nullable(),
    /** Coluna de destino ao abrir a mesa (implementação); `null` = não move. */
    onStart: z.string().trim().max(60).nullable(),
    /** Coluna de destino quando o PR é aberto; `null` = não move. */
    onPr: z.string().trim().max(60).nullable(),
    /** Coluna de destino quando o PR é mergeado; `null` = não move. */
    onDone: z.string().trim().max(60).nullable(),
})
export type AgenticColumns = z.infer<typeof agenticColumnsSchema>

/** Padrão global das colunas: nada ligado (nenhuma fila e "não mover"). */
export const DEFAULT_AGENTIC_COLUMNS: AgenticColumns = { queue: null, onStart: null, onPr: null, onDone: null }

/** Configuração geral (aba "Desenvolvimento agêntico"): liga a feature, define os agentes e as colunas padrão. */
export const agenticSettingsSchema = z.object({
    enabled: z.boolean(),
    agents: z.object(agentsShape),
    columns: agenticColumnsSchema,
})
export type AgenticSettings = z.infer<typeof agenticSettingsSchema>

export const DEFAULT_AGENTIC_SETTINGS: AgenticSettings = {
    enabled: false,
    agents: {
        planning: { ...EMPTY_AGENT, agent: "plan" },
        implementation: { ...EMPTY_AGENT, agent: "build" },
        build: { ...EMPTY_AGENT, agent: "build" },
        pr: { ...EMPTY_AGENT, agent: "build" },
        fork: { ...EMPTY_AGENT, agent: "plan" },
    },
    columns: { ...DEFAULT_AGENTIC_COLUMNS },
}

/**
 * Configuração geral salva → completa: etapas ausentes (versões antigas) caem no padrão, e o agente
 * dos forks, quando ainda não foi configurado, herda o do planejamento.
 */
export function withDefaultAgents(raw: unknown): unknown {
    const value = typeof raw === "object" && raw !== null ? (raw as Partial<AgenticSettings>) : {}
    const saved = (typeof value.agents === "object" && value.agents !== null ? value.agents : {}) as Partial<AgenticSettings["agents"]>
    return { ...DEFAULT_AGENTIC_SETTINGS, ...value, agents: { ...DEFAULT_AGENTIC_SETTINGS.agents, ...saved, fork: saved.fork ?? saved.planning ?? DEFAULT_AGENTIC_SETTINGS.agents.fork } }
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
        /** Builder do Docker (buildx) usado no build da prévia; vazio = o builder padrão do host. Vai para o shell, daí o formato restrito. */
        dockerBuilder: z
            .string()
            .trim()
            .max(100, "Máximo 100 caracteres")
            .regex(/^([A-Za-z0-9][A-Za-z0-9._-]*)?$/, "Nome de builder inválido"),
        portEnvVar: z.string().trim().min(1, "Informe a variável").max(60).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Nome de variável inválido"),
        previewHost: z.string().trim().min(1, "Informe o endereço").max(200).regex(/^[A-Za-z0-9.-]+$/, "Informe só o host (ex.: localhost ou 192.168.0.64)"),
        healthPath: z.string().trim().max(200).regex(/^(\/.*)?$/, "Comece com /"),
        buildTimeoutMinutes: z.number({ error: "Informe um número" }).int().min(2, "Mínimo 2").max(120, "Máximo 120"),
        /**
         * Backup do banco de dados da prévia (OPE-72): ligado, o agente cria o dump antes de
         * publicar e a prévia só vale com ele; desligado, projetos sem banco publicam sem dump.
         * Padrão **ligado** (compatível com a obrigatoriedade anterior).
         */
        backupDatabase: z.boolean().default(true),
        /**
         * Fluxo padrão das mesas novas (OPE-79): ligado, a mesa sobe a prévia e espera a aprovação
         * antes do PR; desligado, a implementação vai direto ao Pull Request. A escolha feita na
         * tarefa (`DevTask.agenticFlow`) tem prioridade sobre este padrão. Padrão **ligado**.
         */
        publishPreview: z.boolean().default(true),
        /** Faixa de portas reservadas às prévias das mesas (min/max inclusive). */
        previewPortMin: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1024, "Mínimo 1024").max(65535, "Máximo 65535"),
        previewPortMax: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1024, "Mínimo 1024").max(65535, "Máximo 65535"),
    }),
    columns: z.object({
        /** Fila: `true` usa a coluna global da aba; `false` personaliza nesta central. */
        inheritQueue: z.boolean(),
        /** Movimentação (abrir a mesa/PR/concluir): `true` usa as colunas globais da aba. */
        inheritMovement: z.boolean(),
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
    forks: z.object({ onWorkbenchDone: z.enum(FORK_DONE_POLICIES) }),
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
        agents: { planning: null, implementation: null, build: null, pr: null, fork: null },
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
        environment: { previewMethod: "local", githubWorkflow: "preview.yml", previewService: "app", composeFile: "", dockerBuilder: "", portEnvVar: "PORT", previewHost: "localhost", healthPath: "/", buildTimeoutMinutes: 20, backupDatabase: true, publishPreview: true, previewPortMin: PREVIEW_PORT_MIN, previewPortMax: PREVIEW_PORT_MAX },
        // Central nova herda os padrões globais de fila e movimentação (a personalização é explícita).
        columns: { inheritQueue: true, inheritMovement: true, queue: null, onStart: null, onPr: null, onDone: null },
        cleanup: { teardownEnvironment: true, removeWorktree: true, deleteBranch: true },
        include: { comments: true, history: false },
        forks: { onWorkbenchDone: "ask" },
        instructions: { planning: "", implementation: "", build: "", pr: "", fork: "" },
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

/** Mensagem do usuário num fork da conversa (a primeira abre o fork). */
export const forkMessageSchema = z.object({ text: z.string().trim().min(1, "Escreva a mensagem") })
export type ForkMessageInput = z.infer<typeof forkMessageSchema>

/** Modo do fork: `plan` (somente leitura) ou `build` (pode alterar arquivos). */
export const forkModeSchema = z.object({ mode: z.enum(FORK_MODES, { error: "Escolha Plan ou Build" }) })
export type ForkModeInput = z.infer<typeof forkModeSchema>

/**
 * Abrir fork: primeira mensagem e, num fork de fork, o fork pai. `readOnly` trava o fork como somente
 * leitura (sem volta); `mode` escolhe o modo inicial (padrão: o do agente do papel Fork).
 */
export const openForkSchema = forkMessageSchema.extend({ parentForkId: z.string().trim().min(1).optional(), readOnly: z.boolean().optional(), mode: z.enum(FORK_MODES).optional() })
export type OpenForkInput = z.infer<typeof openForkSchema>

/** Destino do resumo ao integrar o fork. */
export const forkApplySchema = z.object({ target: z.enum(FORK_INTEGRATION_TARGETS, { error: "Escolha onde integrar" }) })
export type ForkApplyInput = z.infer<typeof forkApplySchema>

/** Resposta à pergunta da mesa concluída com forks em aberto. */
export const forksDonePromptSchema = z.object({ decision: z.enum(["conclude", "keep"]) })
export type ForksDonePromptInput = z.infer<typeof forksDonePromptSchema>

/** Bloco JSON final pedido aos agentes de build, PR e limpeza. */
export const buildResultSchema = z.object({ ok: z.boolean(), error: z.string().optional() })
export const prResultSchema = z.object({ url: z.string().url(), number: z.number().int().positive().optional() })
/** Bloco JSON final do agente de resolução de conflitos: `ok` confirma o push feito no próprio PR. */
export const conflictResultSchema = z.object({ ok: z.boolean(), error: z.string().optional(), sha: z.string().regex(/^[0-9a-f]{7,40}$/i, "SHA inválido").optional() })
