import { Schema, model, models, type Model, type Types } from "mongoose"

/**
 * Desenvolvimento agêntico (Integrações › Inteligência Artificial › Agente Desenvolvedor):
 * - `agentic_centrals`: uma central por projeto (repositório vinculado), com o diretório das sessões e a
 *   configuração (validada pelo schema Zod `centralConfigSchema`);
 * - `agentic_workbenches`: uma mesa de trabalho por tarefa (etapa, sessão do OpenCode, worktree,
 *   porta da prévia, versões do plano e PR);
 * - `agentic_forks`: forks da conversa de uma mesa (sessão paralela somente leitura, resumo e integração);
 * - `agentic_builds`: um documento por build da prévia (etapa "Subindo a prévia"), com o log do comando;
 * - `agentic_events`: a saída da IA de cada mesa (e de cada fork), em ordem (`seq`), para reproduzir a tela;
 * - `agentic_builds`: um documento por build da prévia (etapa "Subindo a prévia"), com o log do comando.
 */

export interface IAgenticCentral {
    _id: Types.ObjectId
    projectId: string
    projectName: string
    config: Record<string, unknown>
    lastTest: { at: Date; ok: boolean; message: string } | null
    createdAt: Date
    updatedAt: Date
}

const AgenticCentralSchema = new Schema<IAgenticCentral>(
    {
        projectId: { type: String, required: true, unique: true },
        projectName: { type: String, required: true },
        config: { type: Schema.Types.Mixed, default: {} },
        lastTest: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "agentic_centrals", versionKey: false, timestamps: true, minimize: false },
)

export interface IPlanVersion {
    version: number
    text: string
    feedback: string | null
    createdAt: Date
}

/**
 * Backup do MongoDB da prévia (OPE-54): o caminho é reservado ANTES do build e o agente cria o
 * dump ali; o primeiro dump é preservado nas retentativas/correções e removido na conclusão.
 */
export interface IPreviewBackup {
    /** Pasta exclusiva do ciclo de backup (fora do worktree, sob a raiz dos worktrees). */
    dir: string
    /** Arquivo `--archive` do mongodump dentro de `dir`. */
    path: string
    createdAt: Date
}

export interface IWorkbenchPr {
    number: number
    url: string
    state: "open" | "closed" | "merged"
    mergedAt: Date | null
    mergeCommitSha: string | null
    /** Maior id de revisão já tratado (as novas pedem replanejamento). */
    lastReviewId: number
    /** Maior id de comentário (conversa ou linha) já tratado; os novos com `@opex` voltam ao planejamento. */
    lastCommentId: number
    closedNotified: boolean
    /** SHA da base do PR na última resolução de conflito iniciada (evita repetir o mesmo conflito). */
    conflictBaseSha: string | null
    /** SHA da branch do PR na última resolução de conflito iniciada; muda a cada push. */
    conflictHeadSha: string | null
    /** Replanejamentos causados pela revisão automática (aba "Agente Revisor"; limite opcional). */
    autoReviewReplans?: number
    /** SHA da branch do PR na última correção de CI iniciada (no mesmo commit, só a primeira pode reexecutar). */
    ciFixHeadSha?: string | null
    /** Falhas tratadas na última correção (`sha:ids das verificações`): o mesmo conjunto não é tratado de novo; uma reexecução gera ids novos. */
    ciFixKey?: string | null
    /** Correções de CI seguidas (zera quando o CI do PR fica verde); limite opcional na central. */
    ciFixAttempts?: number
    /** Aviso de limite de correções de CI já dado para a sequência atual. */
    ciFixLimitNotified?: boolean
}

/** Retomada de uma mesa (etapa isenta ou concluída) aguardando vaga na central; FIFO por `queuedAt`. */
export interface IPendingTurn {
    action: string
    stage: string
    text: string
    userText: string | null
    feedback: string | null
    extraSet: Record<string, unknown> | null
    /** Reabertura: os efeitos (PR para o histórico, mover o card, auditoria) rodam ao ganhar a vaga. */
    reopen: boolean
    /** Etapa da mesa ao entrar na espera; se mudar até a vaga chegar, a espera é descartada. */
    fromStage: string
    queuedAt: Date
    /** Anexos da mensagem do usuário (`agentic_files`), entregues quando o turno começar. */
    fileIds?: string[]
}

/** Resumo de um fork integrado ao contexto da conversa principal (instrução durável da sessão da mesa). */
/** Modelo (`provedor/modelo`) e variante trocados na mesa ou no fork (o agente continua o da etapa/modo). */
export interface IModelOverride {
    model: string
    variant: string | null
}

export interface IForkNote {
    forkId: string
    number: number
    summary: string
    createdAt: Date
}

export interface IAgenticWorkbench {
    _id: Types.ObjectId
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    stage: string
    runState: string
    error: string | null
    lastStage: string | null
    /** Prompt do último turno (o "Tentar novamente" reenvia o texto e os anexos). */
    lastPrompt: { stage: string; text: string; fileIds?: string[] } | null
    /** Instante em que o último turno começou (delimita a execução acompanhada ao reconectar). */
    turnStartedAt: Date | null
    /**
     * Instante do "Parar" pedido pelo usuário; distingue a interrupção pedida das perdas (queda,
     * reinício). Enquanto existir, a reconexão automática fica desligada para este episódio.
     */
    stopRequestedAt: Date | null
    /** Desfecho da última tentativa de reconexão (estado estável do ciclo automático do cliente). */
    reconnect: { outcome: string; message: string | null; at: Date } | null
    sessionId: string | null
    sessionDirectory: string | null
    /** IDs de sessões do OpenCode já desvinculadas da mesa e ainda pendentes de exclusão. */
    pendingSessionDeletions: string[]
    branch: string | null
    worktreePath: string | null
    composeProject: string | null
    port: number | null
    /** Instante em que a mesa entrou na fila global do build (`null` fora da fila); define a ordem FIFO. */
    buildQueuedAt: Date | null
    /**
     * Reserva do build: método da prévia e, no modo remoto, tentativa/estado. `dumpRequired` é a
     * política efetiva de backup desta tentativa (false = prévia sem dump, OPE-72); ausente em
     * mesas antigas conta como exigido.
     */
    /**
     * Build da prévia em curso. `attempt`/`statePath` = tentativa do GitHub Action; `job` = comando
     * rodando no host pelo app (`docker compose … up -d --build` ou o script da prévia remota; a
     * reconexão retoma a leitura); `port`/`docker` = como o build foi montado (refazer o comando depois
     * de uma correção); `prepared` = o turno de preparo do agente (dump/commit) já concluiu.
     */
    previewBuild?: {
        method: "local" | "github"
        attempt?: string
        statePath?: string
        dumpRequired?: boolean
        job?: string
        port?: number
        docker?: { prefix: string; files?: string[] } | null
        prepared?: boolean
    } | null
    previewUrl: string | null
    previewHealthy: boolean | null
    /** Fluxo escolhido na abertura da mesa (`preview` sobe a prévia; `auto_pr` vai direto ao PR). */
    agenticFlow: string
    /** Backup do MongoDB da prévia (reservado no build); `null` quando a mesa não tem backup. */
    previewBackup: IPreviewBackup | null
    /**
     * Pedido de exclusão da mesa (OPE-68): a intenção fica gravada enquanto a limpeza do ambiente
     * não termina; `null` quando não há exclusão pendente. O registro só é apagado ao final.
     */
    deletionRequestedAt: Date | null
    plans: IPlanVersion[]
    pendingFeedback: string | null
    /** Turno aguardando vaga no limite de mesas da central (`null` quando não há espera). */
    pendingTurn: IPendingTurn | null
    /** Último número de fork usado (os números não se repetem). */
    forkSeq: number
    /** Modelo/variante trocados na mesa por papel (planning, implementation, build, pr); ausente = modelo do papel. */
    modelOverrides?: Partial<Record<string, IModelOverride>> | null
    /** Resumos de forks integrados ao contexto da conversa principal. */
    forkNotes: IForkNote[]
    /** `false` quando os resumos não puderam ser gravados como instrução da sessão: vão no próximo prompt. */
    forkNotesSynced: boolean
    /** Mesa concluída com forks em aberto aguardando a decisão do usuário (política "Sempre perguntar"). */
    forksDonePrompt: { count: number; at: Date } | null
    pr: IWorkbenchPr | null
    pastPrs: IWorkbenchPr[]
    /** Conclusão manual (sem PR) pela ação "Definir etapa": motivo e etapa de origem; `null` na conclusão pelo merge. */
    manualCompletion?: { reason: string; fromStage: string; at: Date } | null
    pendingPermissions: unknown[]
    pendingForms: unknown[]
    usage: { costUsd: number; inputTokens: number; outputTokens: number; reasoningTokens: number }
    heartbeatAt: Date | null
    startedAt: Date
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const AgenticWorkbenchSchema = new Schema<IAgenticWorkbench>(
    {
        centralId: { type: String, required: true, index: true },
        taskId: { type: String, required: true, unique: true },
        taskCode: { type: String, required: true },
        taskTitle: { type: String, required: true },
        stage: { type: String, required: true, index: true },
        runState: { type: String, required: true, default: "idle" },
        error: { type: String, default: null },
        lastStage: { type: String, default: null },
        lastPrompt: { type: Schema.Types.Mixed, default: null },
        turnStartedAt: { type: Date, default: null },
        stopRequestedAt: { type: Date, default: null },
        reconnect: { type: Schema.Types.Mixed, default: null },
        sessionId: { type: String, default: null },
        sessionDirectory: { type: String, default: null },
        pendingSessionDeletions: { type: [String], default: [] },
        branch: { type: String, default: null },
        worktreePath: { type: String, default: null },
        composeProject: { type: String, default: null },
        port: { type: Number, default: null },
        buildQueuedAt: { type: Date, default: null },
        previewBuild: { type: Schema.Types.Mixed, default: null },
        previewUrl: { type: String, default: null },
        previewHealthy: { type: Boolean, default: null },
        agenticFlow: { type: String, default: "preview" },
        previewBackup: { type: Schema.Types.Mixed, default: null },
        deletionRequestedAt: { type: Date, default: null },
        plans: { type: [Schema.Types.Mixed] as unknown as IPlanVersion[], default: [] },
        pendingFeedback: { type: String, default: null },
        pendingTurn: { type: Schema.Types.Mixed, default: null },
        forkSeq: { type: Number, default: 0 },
        modelOverrides: { type: Schema.Types.Mixed, default: null },
        forkNotes: { type: [Schema.Types.Mixed] as unknown as IForkNote[], default: [] },
        forkNotesSynced: { type: Boolean, default: true },
        forksDonePrompt: { type: Schema.Types.Mixed, default: null },
        pr: { type: Schema.Types.Mixed, default: null },
        pastPrs: { type: [Schema.Types.Mixed] as unknown as IWorkbenchPr[], default: [] },
        manualCompletion: { type: Schema.Types.Mixed, default: null },
        pendingPermissions: { type: [Schema.Types.Mixed], default: [] },
        pendingForms: { type: [Schema.Types.Mixed], default: [] },
        usage: { type: Schema.Types.Mixed, default: () => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }) },
        heartbeatAt: { type: Date, default: null },
        startedAt: { type: Date, default: () => new Date() },
        completedAt: { type: Date, default: null },
    },
    { collection: "agentic_workbenches", versionKey: false, timestamps: true, minimize: false },
)
// Uma porta por mesa ativa (as concluídas liberam a porta gravando null).
AgenticWorkbenchSchema.index({ port: 1 }, { unique: true, partialFilterExpression: { port: { $type: "number" } } })
// Fila global do build: mesas aguardando, na ordem de chegada.
AgenticWorkbenchSchema.index({ buildQueuedAt: 1 }, { partialFilterExpression: { buildQueuedAt: { $type: "date" } } })
// Retomadas aguardando vaga na central, na ordem de chegada.
AgenticWorkbenchSchema.index({ centralId: 1, "pendingTurn.queuedAt": 1 }, { partialFilterExpression: { "pendingTurn.queuedAt": { $type: "date" } } })

export interface IForkIntegration {
    target: string
    summary: string
    appliedAt: Date
}

export interface IAgenticFork {
    _id: Types.ObjectId
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    /** Número do fork na mesa (1, 2, …; nunca reaproveitado). */
    number: number
    /** Fork pai (fork de fork); `null` quando aberto da conversa principal. */
    parentForkId: string | null
    /** Número do fork pai (mantido mesmo se o pai for descartado). */
    parentNumber: number | null
    /** Resumos de forks filhos integrados à conversa deste fork. */
    childNotes: IForkNote[]
    /** `false` quando os resumos dos filhos não viraram instrução da sessão: vão no próximo prompt. */
    childNotesSynced: boolean
    status: string
    runState: string
    error: string | null
    sessionId: string | null
    sessionDirectory: string | null
    /** `fork`: cópia da sessão principal; `fresh`: sessão nova com o contexto da mesa (mesa sem sessão). */
    origin: string
    /** Modo atual: `plan` (somente leitura) ou `build` (pode alterar arquivos). Ausente (forks antigos) = `plan`. */
    mode?: string
    /** Travado como somente leitura (na abertura ou depois, sem volta): o modo fica `plan`. Ausente = `false`. */
    readOnly?: boolean
    /** Aviso de troca de modo que vai no início da próxima mensagem ao agente (uma vez). */
    pendingModeNote?: string | null
    /** Modelo/variante trocados neste fork; `null` = modelo do papel Fork da conversa. */
    modelOverride?: IModelOverride | null
    /** Etapa da mesa quando o fork foi aberto. */
    forkedFromStage: string
    /** Resumo proposto para integração (em revisão enquanto `integrating`). */
    summary: string | null
    integration: IForkIntegration | null
    lastPrompt: { text: string; fileIds?: string[] } | null
    turnStartedAt: Date | null
    pendingPermissions: unknown[]
    pendingForms: unknown[]
    usage: { costUsd: number; inputTokens: number; outputTokens: number; reasoningTokens: number }
    heartbeatAt: Date | null
    closedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const AgenticForkSchema = new Schema<IAgenticFork>(
    {
        workbenchId: { type: String, required: true },
        centralId: { type: String, required: true },
        taskId: { type: String, required: true },
        taskCode: { type: String, required: true },
        number: { type: Number, required: true },
        parentForkId: { type: String, default: null },
        parentNumber: { type: Number, default: null },
        childNotes: { type: [Schema.Types.Mixed] as unknown as IForkNote[], default: [] },
        childNotesSynced: { type: Boolean, default: true },
        status: { type: String, required: true, default: "active" },
        runState: { type: String, required: true, default: "idle" },
        error: { type: String, default: null },
        sessionId: { type: String, default: null },
        sessionDirectory: { type: String, default: null },
        origin: { type: String, default: "fork" },
        mode: { type: String, default: "plan" },
        readOnly: { type: Boolean, default: false },
        pendingModeNote: { type: String, default: null },
        modelOverride: { type: Schema.Types.Mixed, default: null },
        forkedFromStage: { type: String, required: true },
        summary: { type: String, default: null },
        integration: { type: Schema.Types.Mixed, default: null },
        lastPrompt: { type: Schema.Types.Mixed, default: null },
        turnStartedAt: { type: Date, default: null },
        pendingPermissions: { type: [Schema.Types.Mixed], default: [] },
        pendingForms: { type: [Schema.Types.Mixed], default: [] },
        usage: { type: Schema.Types.Mixed, default: () => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }) },
        heartbeatAt: { type: Date, default: null },
        closedAt: { type: Date, default: null },
    },
    { collection: "agentic_forks", versionKey: false, timestamps: true, minimize: false },
)
AgenticForkSchema.index({ workbenchId: 1, number: 1 }, { unique: true })

export interface IAgenticEvent {
    workbenchId: string
    seq: number
    payload: Record<string, unknown>
    ts: Date
}

const AgenticEventSchema = new Schema<IAgenticEvent>(
    {
        workbenchId: { type: String, required: true },
        seq: { type: Number, required: true },
        payload: { type: Schema.Types.Mixed, required: true },
        ts: { type: Date, required: true, default: () => new Date() },
    },
    { collection: "agentic_events", versionKey: false, minimize: false },
)
AgenticEventSchema.index({ workbenchId: 1, seq: 1 }, { unique: true })

export type AgenticBuildStatus = "running" | "succeeded" | "unhealthy" | "failed" | "interrupted"

export interface IAgenticBuild {
    _id: Types.ObjectId
    workbenchId: string
    /** 1, 2, 3… por mesa. */
    number: number
    status: AgenticBuildStatus
    /** Método da prévia: comando local (`docker compose`) ou o script do GitHub Action. */
    method: "local" | "github"
    startedAt: Date
    endedAt: Date | null
    port: number | null
    /** Prévia no PC (Builder Machine). */
    local: boolean
    /** Comandos de build executados (na ordem: o primeiro e um por correção do agente). */
    commands: string[]
    /** Posição absoluta onde começa a saída da execução atual (retomar a leitura após reiniciar o app). */
    sectionStart: number
    /** Log (com teto: guarda o final; `droppedChars` conta o início descartado). */
    log: string
    /** Tamanho total recebido (posição absoluta do fim do log). */
    logChars: number
    droppedChars: number
    message: string | null
}

const AgenticBuildSchema = new Schema<IAgenticBuild>(
    {
        workbenchId: { type: String, required: true },
        number: { type: Number, required: true },
        status: { type: String, required: true, default: "running" },
        method: { type: String, default: "local" },
        startedAt: { type: Date, required: true, default: () => new Date() },
        endedAt: { type: Date, default: null },
        port: { type: Number, default: null },
        local: { type: Boolean, default: false },
        commands: { type: [String], default: [] },
        sectionStart: { type: Number, default: 0 },
        log: { type: String, default: "" },
        logChars: { type: Number, default: 0 },
        droppedChars: { type: Number, default: 0 },
        message: { type: String, default: null },
    },
    { collection: "agentic_builds", versionKey: false, minimize: false },
)
AgenticBuildSchema.index({ workbenchId: 1, number: 1 }, { unique: true })

/**
 * Arquivo anexado a uma mensagem da mesa de trabalho (ou de um fork). O binário fica no Storage S3
 * (`uploadKey` temporária até a confirmação, `key` definitiva); sem `workbenchId`, ainda não foi numa
 * mensagem (a limpeza oportunista remove depois de 24 h).
 */
export interface IAgenticFile {
    _id: Types.ObjectId
    workbenchId: string | null
    forkId: string | null
    name: string
    mediaType: string
    size: number
    key: string
    uploadKey: string | null
    ready: boolean
    claimedAt: Date | null
    createdAt: Date
}

const AgenticFileSchema = new Schema<IAgenticFile>(
    {
        workbenchId: { type: String, default: null },
        forkId: { type: String, default: null },
        name: { type: String, required: true },
        mediaType: { type: String, required: true },
        size: { type: Number, required: true },
        key: { type: String, required: true },
        uploadKey: { type: String, default: null },
        ready: { type: Boolean, default: false },
        claimedAt: { type: Date, default: null },
    },
    { collection: "agentic_files", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
AgenticFileSchema.index({ workbenchId: 1 })
AgenticFileSchema.index({ forkId: 1 })
AgenticFileSchema.index({ workbenchId: 1, createdAt: 1 })

if (process.env.NODE_ENV === "development") {
    delete models.AgenticFile
    delete models.AgenticCentral
    delete models.AgenticWorkbench
    delete models.AgenticFork
    delete models.AgenticEvent
    delete models.AgenticBuild
}

export const AgenticCentral: Model<IAgenticCentral> = (models.AgenticCentral as Model<IAgenticCentral>) || model<IAgenticCentral>("AgenticCentral", AgenticCentralSchema)
export const AgenticWorkbench: Model<IAgenticWorkbench> =
    (models.AgenticWorkbench as Model<IAgenticWorkbench>) || model<IAgenticWorkbench>("AgenticWorkbench", AgenticWorkbenchSchema)
export const AgenticFork: Model<IAgenticFork> = (models.AgenticFork as Model<IAgenticFork>) || model<IAgenticFork>("AgenticFork", AgenticForkSchema)
export const AgenticEvent: Model<IAgenticEvent> = (models.AgenticEvent as Model<IAgenticEvent>) || model<IAgenticEvent>("AgenticEvent", AgenticEventSchema)
export const AgenticBuild: Model<IAgenticBuild> = (models.AgenticBuild as Model<IAgenticBuild>) || model<IAgenticBuild>("AgenticBuild", AgenticBuildSchema)
export const AgenticFile: Model<IAgenticFile> = (models.AgenticFile as Model<IAgenticFile>) || model<IAgenticFile>("AgenticFile", AgenticFileSchema)
