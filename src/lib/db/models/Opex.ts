import { Schema, model, models, type Model, type Types } from "mongoose"
import type { OpexJobStatus, OpexJobUnit, OpexJobWhen } from "@/features/opex-agent/jobs"
import type { OpexMcpAuthMode, OpexMcpOauthStatus, OpexMcpToolInfo, OpexMcpTransport } from "@/features/opex-agent/mcp"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import type { OpexConfirmationStatus, OpexMessageKind, OpexMessageStatus, OpexMessageWatchRef, OpexPart, OpexSessionStatus, OpexUsageDto } from "@/features/opex-agent/types"
import type { OpexWatchCondition, OpexWatchOutcome, OpexWatchStatus, OpexWatchTarget } from "@/features/opex-agent/watches"

/**
 * Coleções do Agente Opex (`opex_sessions`, `opex_messages`, `opex_pending_actions`, `opex_files`, `opex_jobs`,
 * `opex_watches`, `opex_mcp_servers` e `opex_skills`).
 * Ver `aicontext/modules/opex-agent.md`. Os índices são garantidos pela migração
 * `ensure-opex-indexes`.
 */

/** Agente dono de uma sessão (as coleções `opex_*` guardam os três; `routine` = conversa com um agente rotineiro, OPE-160). */
export type OpexAgentKind = "opex" | "maddox" | "routine"

/** Pedido do OpenCode em aberto numa sessão do Agente Maddox. */
export interface IMaddoxPendingRequest {
    /** Id do pedido no OpenCode (permissão ou formulário). */
    id: string
    kind: "permission" | "form"
    /** Card da ferramenta (ou parte do formulário) na resposta em andamento. */
    partId: string
    createdAt: Date
}

export interface IOpexSession {
    title: string
    summary: string
    titleSource: "auto" | "manual"
    status: OpexSessionStatus
    lastError: string | null
    archived: boolean
    /** Quando a sessão foi arquivada (tela ou rotina de limpeza); `null`/ausente = não arquivada ou arquivada antes do campo. */
    archivedAt?: Date | null
    messageCount: number
    /** Próximo número de ordem das mensagens. */
    nextSeq: number
    /** Cliente do portal dono da sessão; `null` = sessão do app do dono. */
    clientId: string | null
    /** Usuário dono da sessão (`local` no app do dono; id do usuário no portal). */
    userId: string
    /** Agente da sessão; ausente = Agente Opex (sessões anteriores ao Agente Maddox). */
    agent?: OpexAgentKind
    /** Conversa com um agente rotineiro (`agent: "routine"`, OPE-160): id do agente. */
    routineAgentId?: string | null
    /** Agente Maddox: sessão do OpenCode que guarda a conversa (criada no primeiro turno). */
    opencodeSessionId?: string | null
    /** Agente Maddox: modelo trocado só nesta sessão (`null` = padrão da configuração). */
    modelOverride?: { model: string; variant: string | null } | null
    /** Agente Maddox: pedidos do OpenCode (permissão/pergunta) aguardando resposta neste turno. */
    pendingRequests?: IMaddoxPendingRequest[]
    lastMessageAt: Date
    createdAt: Date
    updatedAt: Date
}

/** Metadados de um arquivo na mensagem do usuário (o binário fica no Storage S3). */
export interface IOpexFileRef {
    id: string
    name: string
    mediaType: string
    size: number
}

export interface IOpexMessage {
    sessionId: Types.ObjectId
    seq: number
    role: "user" | "assistant"
    kind: OpexMessageKind
    /** Mensagem disparada por um job agendado. */
    job?: { id: string; title: string } | null
    /** Notificação do sistema que acordou o agente (observações entregues, OPE-194). */
    watch?: OpexMessageWatchRef | null
    text: string
    files: IOpexFileRef[]
    parts: OpexPart[]
    /**
     * Mensagens no formato da AI SDK (`ModelMessage[]`) em JSON, reenviadas como histórico. Texto, não
     * objeto: resultados de ferramenta podem ter chaves que o MongoDB não aceita (`$`, `.`).
     */
    modelMessages: string
    status: OpexMessageStatus
    error: string | null
    usage: OpexUsageDto | null
    durationMs: number | null
    model: string | null
    createdAt: Date
}

/**
 * Arquivo do chat: só metadados. A reserva grava `uploadKey` (chave temporária do PUT assinado);
 * a confirmação confere o objeto e o promove para `key` (`ready: true`). `pending` = ainda não foi
 * numa mensagem; a rotina `opex-files-cleanup` remove os pendentes com mais de 24 h (S3 + registro).
 */
export interface IOpexFile {
    sessionId: Types.ObjectId
    /** Mensagem que usou o arquivo; `null` enquanto pendente. */
    messageId: Types.ObjectId | null
    pending: boolean
    /** Envio confirmado no storage (objeto promovido para `key`). */
    ready: boolean
    name: string
    mediaType: string
    size: number
    key: string
    uploadKey: string
    createdAt: Date
}

export interface IOpexPendingAction {
    sessionId: Types.ObjectId
    messageId: Types.ObjectId | null
    toolCallId: string
    toolName: string
    /** Entrada cifrada (`secretBox`): pode conter segredos; apagada depois da decisão. */
    input: unknown
    summary: string
    /** Plugins com a prévia ligada no turno que propôs a ação (OPE-172): a confirmação usa o mesmo canal. */
    previewPlugins?: string[]
    status: OpexConfirmationStatus
    /** Resultado da execução confirmada (JSON). */
    result: string | null
    error: string | null
    expiresAt: Date
    decidedAt: Date | null
    createdAt: Date
}

const OpexSessionSchema = new Schema<IOpexSession>(
    {
        title: { type: String, required: true },
        summary: { type: String, default: "" },
        titleSource: { type: String, enum: ["auto", "manual"], default: "auto" },
        status: { type: String, enum: ["idle", "running", "awaiting_confirmation", "error"], default: "idle" },
        lastError: { type: String, default: null },
        archived: { type: Boolean, default: false },
        archivedAt: { type: Date, default: null },
        messageCount: { type: Number, default: 0 },
        nextSeq: { type: Number, default: 1 },
        clientId: { type: String, default: null },
        userId: { type: String, default: "" },
        agent: { type: String, enum: ["opex", "maddox", "routine"], default: "opex" },
        routineAgentId: { type: String, default: null },
        opencodeSessionId: { type: String, default: null },
        modelOverride: { type: Schema.Types.Mixed, default: null },
        pendingRequests: { type: Schema.Types.Mixed, default: [] },
        lastMessageAt: { type: Date, default: () => new Date() },
    },
    { collection: "opex_sessions", versionKey: false, timestamps: true },
)
// Sessões do dono (`clientId: null`, inclusive as antigas sem o campo) e as privadas por cliente/usuário.
OpexSessionSchema.index({ clientId: 1, userId: 1, archived: 1, lastMessageAt: -1 })
// Agente Maddox: sessões por agente e a busca pela sessão do OpenCode (servidor MCP do Opex).
OpexSessionSchema.index({ agent: 1, clientId: 1, userId: 1, lastMessageAt: -1 })
OpexSessionSchema.index({ opencodeSessionId: 1 }, { sparse: true })
// Conversas com um agente rotineiro (OPE-160).
OpexSessionSchema.index({ agent: 1, routineAgentId: 1, lastMessageAt: -1 })

const OpexMessageSchema = new Schema<IOpexMessage>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true },
        seq: { type: Number, required: true },
        role: { type: String, enum: ["user", "assistant"], required: true },
        kind: { type: String, enum: ["message", "confirmation", "job", "notice", "event"], default: "message" },
        job: { type: Schema.Types.Mixed, default: undefined },
        watch: { type: Schema.Types.Mixed, default: undefined },
        text: { type: String, default: "" },
        files: { type: Schema.Types.Mixed, default: [] },
        parts: { type: Schema.Types.Mixed, default: [] },
        modelMessages: { type: String, default: "[]" },
        status: { type: String, enum: ["complete", "interrupted", "error"], default: "complete" },
        error: { type: String, default: null },
        usage: { type: Schema.Types.Mixed, default: null },
        durationMs: { type: Number, default: null },
        model: { type: String, default: null },
    },
    { collection: "opex_messages", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
OpexMessageSchema.index({ sessionId: 1, seq: 1 }, { unique: true })
// Recuperação da entrega de observações: a mensagem que já acordou o agente (OPE-194).
OpexMessageSchema.index({ "watch.ids": 1 }, { sparse: true })

const OpexPendingActionSchema = new Schema<IOpexPendingAction>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
        messageId: { type: Schema.Types.ObjectId, default: null },
        toolCallId: { type: String, required: true },
        toolName: { type: String, required: true },
        input: { type: Schema.Types.Mixed, default: null },
        summary: { type: String, required: true },
        previewPlugins: { type: [String], default: [] },
        status: { type: String, enum: ["pending", "confirmed", "cancelled", "failed", "expired"], default: "pending" },
        result: { type: String, default: null },
        error: { type: String, default: null },
        expiresAt: { type: Date, required: true },
        decidedAt: { type: Date, default: null },
    },
    { collection: "opex_pending_actions", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)

const OpexFileSchema = new Schema<IOpexFile>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
        messageId: { type: Schema.Types.ObjectId, default: null },
        pending: { type: Boolean, default: true },
        ready: { type: Boolean, default: false },
        name: { type: String, required: true },
        mediaType: { type: String, required: true },
        size: { type: Number, required: true },
        key: { type: String, required: true },
        uploadKey: { type: String, required: true },
    },
    { collection: "opex_files", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
OpexFileSchema.index({ pending: 1, createdAt: 1 })

/**
 * Job (prompt agendado do agente) — `opex_jobs`. `clientId`/`userId` seguem a sessão: `null` = job do
 * dono; preenchidos = job de um usuário do portal. Terminado, sai pelo TTL de `purgeAt`.
 */
export interface IOpexJob {
    _id: Types.ObjectId
    title: string
    prompt: string
    sessionId: Types.ObjectId | null
    resultSessionId: Types.ObjectId | null
    schedule: { when: OpexJobWhen; amount: number | null; unit: OpexJobUnit | null; date: string | null; time: string | null }
    runAt: Date
    status: OpexJobStatus
    startedAt: Date | null
    finishedAt: Date | null
    delayMs: number | null
    error: string | null
    createdBy: "user" | "agent"
    originSessionId: Types.ObjectId | null
    sourceJobId: Types.ObjectId | null
    /** Cliente do portal dono do job; `null` = job do dono. */
    clientId: string | null
    /** Usuário dono do job (`local` no app do dono; id do usuário no portal). */
    userId: string
    purgeAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const OpexJobSchema = new Schema<IOpexJob>(
    {
        title: { type: String, required: true },
        prompt: { type: String, required: true },
        sessionId: { type: Schema.Types.ObjectId, default: null },
        resultSessionId: { type: Schema.Types.ObjectId, default: null },
        schedule: { type: Schema.Types.Mixed, required: true },
        runAt: { type: Date, required: true },
        status: { type: String, enum: ["scheduled", "running", "done", "error", "awaiting_confirmation", "canceled"], default: "scheduled" },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        delayMs: { type: Number, default: null },
        error: { type: String, default: null },
        createdBy: { type: String, enum: ["user", "agent"], default: "user" },
        originSessionId: { type: Schema.Types.ObjectId, default: null },
        sourceJobId: { type: Schema.Types.ObjectId, default: null },
        clientId: { type: String, default: null },
        userId: { type: String, default: "" },
        purgeAt: { type: Date, default: null },
    },
    { collection: "opex_jobs", versionKey: false, timestamps: true },
)
OpexJobSchema.index({ status: 1, runAt: 1 })
OpexJobSchema.index({ createdAt: -1 })
OpexJobSchema.index({ clientId: 1, userId: 1, runAt: -1 })
OpexJobSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "purge_ttl" })

/**
 * Observação de evento do Agente Opex (OPE-194) — `opex_watches`. Acorda a sessão `sessionId` uma vez,
 * quando o evento acontece, vence ou o alvo é excluído. Encerrada, sai pelo TTL de `purgeAt`.
 */
export interface IOpexWatch {
    _id: Types.ObjectId
    sessionId: Types.ObjectId
    /** Cliente do portal; `null` = observação do dono. */
    clientId: string | null
    userId: string
    createdBy: "agent"
    target: OpexWatchTarget & { meta?: Record<string, unknown> | null }
    condition: OpexWatchCondition
    note: string
    status: OpexWatchStatus
    outcome: OpexWatchOutcome | null
    event: { summary: string; short: string; at: Date } | null
    /** Início da observação: fato anterior a isto não a dispara (o fato pode ser processado atrasado). */
    since: Date
    expiresAt: Date
    triggeredAt: Date | null
    deliveryKey: string | null
    deliveringAt: Date | null
    wokenAt: Date | null
    /** Mensagem de sistema gravada na sessão; com a observação ainda "delivering", o turno dela não terminou. */
    messageId: Types.ObjectId | null
    error: string | null
    canceledBy: string | null
    purgeAt: Date | null
    createdAt: Date
    updatedAt: Date
}

/**
 * Fato de uma transição observada (OPE-194) — `opex_watch_facts`: a fonte grava o fato logo depois da
 * mutação (só quando há observação no alvo) e o processamento dispara as observações. Pendente ou com o
 * lease vencido, o tick reprocessa: um reinício entre a transição e o disparo não perde o evento.
 */
export interface IOpexWatchFact {
    _id: Types.ObjectId
    kind: OpexWatchTarget["kind"]
    targetId: string
    /** Dados brutos da transição (o fato montado com nomes sai no processamento). */
    source: Record<string, unknown>
    at: Date
    status: "pending" | "processing" | "done" | "failed"
    leaseUntil: Date | null
    attempts: number
    error: string | null
    purgeAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const OpexWatchFactSchema = new Schema<IOpexWatchFact>(
    {
        kind: { type: String, required: true },
        targetId: { type: String, required: true },
        source: { type: Schema.Types.Mixed, default: {} },
        at: { type: Date, required: true },
        status: { type: String, enum: ["pending", "processing", "done", "failed"], default: "pending" },
        leaseUntil: { type: Date, default: null },
        attempts: { type: Number, default: 0 },
        error: { type: String, default: null },
        purgeAt: { type: Date, default: null },
    },
    { collection: "opex_watch_facts", versionKey: false, timestamps: true, minimize: false },
)
OpexWatchFactSchema.index({ status: 1, at: 1 })
OpexWatchFactSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "purge_ttl" })

const OpexWatchSchema = new Schema<IOpexWatch>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true },
        clientId: { type: String, default: null },
        userId: { type: String, default: "" },
        createdBy: { type: String, enum: ["agent"], default: "agent" },
        target: { type: Schema.Types.Mixed, required: true },
        condition: { type: Schema.Types.Mixed, required: true },
        note: { type: String, default: "" },
        status: { type: String, enum: ["watching", "triggered", "delivering", "woken", "expired", "canceled", "error"], default: "watching" },
        outcome: { type: String, enum: ["event", "expired", "target_deleted", null], default: null },
        event: { type: Schema.Types.Mixed, default: null },
        since: { type: Date, default: () => new Date() },
        expiresAt: { type: Date, required: true },
        triggeredAt: { type: Date, default: null },
        deliveryKey: { type: String, default: null },
        deliveringAt: { type: Date, default: null },
        wokenAt: { type: Date, default: null },
        messageId: { type: Schema.Types.ObjectId, default: null },
        error: { type: String, default: null },
        canceledBy: { type: String, default: null },
        purgeAt: { type: Date, default: null },
    },
    { collection: "opex_watches", versionKey: false, timestamps: true },
)
OpexWatchSchema.index({ status: 1, "target.kind": 1, "target.id": 1 })
OpexWatchSchema.index({ status: 1, expiresAt: 1 })
OpexWatchSchema.index({ sessionId: 1, status: 1 })
OpexWatchSchema.index({ clientId: 1, userId: 1, createdAt: -1 })
OpexWatchSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "purge_ttl" })

/** Header (HTTP/SSE) ou variável de ambiente (stdio) de um MCP: valor cifrado com `secretBox`. */
export interface IOpexMcpSecret {
    key: string
    value: EncryptedSecret
}

/** Pedido de autorização OAuth em andamento (state + verificador PKCE, cifrados; um por MCP). */
export interface IOpexMcpOauthPending {
    /** SHA-256 (hex) do `state`: localiza o pedido no retorno sem decifrar nada. */
    stateHash: string
    state: EncryptedSecret
    codeVerifier: EncryptedSecret | null
    redirectUri: string
    expiresAt: Date
    actorId: string
}

/** Servidor de autorização que emitiu as credenciais (sem segredos). */
export interface IOpexMcpOauthServer {
    issuer?: string
    authorizationServerUrl: string
    tokenEndpoint: string
    revocationEndpoint?: string | null
}

/**
 * OAuth de um MCP (OPE-176). Segredos (client secret, cliente registrado, tokens, state, verificador)
 * cifrados com `secretBox`; nunca saem no DTO.
 */
export interface IOpexMcpOauth {
    clientId: string
    clientSecret: EncryptedSecret | null
    scope: string
    /** JSON cifrado: `{ info: OAuthClientInformation, redirectUri, dynamic }`. */
    client: EncryptedSecret | null
    /** JSON cifrado: `OAuthTokens`. */
    tokens: EncryptedSecret | null
    /** Geração dos tokens (gravação condicional entre renovações concorrentes). */
    tokenVersion: number
    expiresAt: Date | null
    server: IOpexMcpOauthServer | null
    pending: IOpexMcpOauthPending | null
    status: OpexMcpOauthStatus
    authorizedAt: Date | null
    lastError: string | null
}

/** MCP (servidor Model Context Protocol) usado pelo Agente Opex. */
export interface IOpexMcpServer {
    name: string
    /** Identificador único usado no nome das ferramentas (`mcp_{slug}_{ferramenta}`). */
    slug: string
    description: string
    enabled: boolean
    transport: OpexMcpTransport
    url: string
    command: string
    args: string[]
    headers: IOpexMcpSecret[]
    env: IOpexMcpSecret[]
    /** Autenticação do HTTP/SSE (ausente nos documentos antigos = `headers`). */
    auth: OpexMcpAuthMode
    oauth: IOpexMcpOauth | null
    /** "Pede confirmação" por ferramenta (nome original); ausente = padrão pela anotação. */
    confirmations: Record<string, boolean>
    tools: OpexMcpToolInfo[]
    toolsSyncedAt: Date | null
    lastError: string | null
    lastCheckedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const OpexMcpSecretSchema = new Schema<IOpexMcpSecret>({ key: { type: String, required: true }, value: { type: Schema.Types.Mixed, required: true } }, { _id: false })

const OpexMcpServerSchema = new Schema<IOpexMcpServer>(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true },
        description: { type: String, default: "" },
        enabled: { type: Boolean, default: true },
        transport: { type: String, required: true },
        url: { type: String, default: "" },
        command: { type: String, default: "" },
        args: { type: [String], default: [] },
        headers: { type: [OpexMcpSecretSchema], default: [] },
        env: { type: [OpexMcpSecretSchema], default: [] },
        auth: { type: String, default: "headers" },
        oauth: { type: Schema.Types.Mixed, default: null },
        confirmations: { type: Schema.Types.Mixed, default: {} },
        tools: { type: Schema.Types.Mixed, default: [] },
        toolsSyncedAt: { type: Date, default: null },
        lastError: { type: String, default: null },
        lastCheckedAt: { type: Date, default: null },
    },
    { collection: "opex_mcp_servers", versionKey: false, timestamps: true, minimize: false },
)
OpexMcpServerSchema.index({ slug: 1 }, { unique: true })

/** Arquivo de apoio de uma skill do Opex (caminho relativo à pasta da skill). */
export interface IOpexSkillFile {
    path: string
    content: Buffer
    /** Conteúdo não textual (só listado; o agente não lê). */
    binary: boolean
    size: number
}

/** Origem de uma skill: criada no Opex ou instalada de uma pasta de repositório do GitHub. */
export interface IOpexSkillOrigin {
    kind: "opex" | "github"
    /** `dono/repo` (só GitHub). */
    repo: string | null
    /** Ref pedida na instalação (`null` = branch padrão). */
    ref: string | null
    /** Pasta da skill no repositório (`""` = raiz). */
    path: string | null
}

/** Skill do Agente Opex (OPE-153): um documento por skill, gravado de uma vez (sem gravação parcial). */
export interface IOpexSkill {
    /** Nome único e imutável (= pasta), usado na seleção dos agentes rotineiros. */
    name: string
    description: string
    /** Corpo do `SKILL.md` (sem o frontmatter). */
    body: string
    /** Frontmatter extra do `SKILL.md` (além de `name` e `description`). */
    extra: Record<string, unknown>
    files: IOpexSkillFile[]
    origin: IOpexSkillOrigin
    /** SHA da árvore da pasta no GitHub na instalação/atualização (`null` = criada no Opex). */
    hash: string | null
    /** Ligada para o Agente Opex do dono nas conversas (não afeta os rotineiros). */
    enabled: boolean
    /** Tamanho total (corpo + arquivos), em bytes. */
    size: number
    createdAt: Date
    updatedAt: Date
}

const OpexSkillFileSchema = new Schema<IOpexSkillFile>(
    { path: { type: String, required: true }, content: { type: Buffer, required: true }, binary: { type: Boolean, default: false }, size: { type: Number, default: 0 } },
    { _id: false },
)

const OpexSkillSchema = new Schema<IOpexSkill>(
    {
        name: { type: String, required: true },
        description: { type: String, required: true },
        body: { type: String, default: "" },
        extra: { type: Schema.Types.Mixed, default: {} },
        files: { type: [OpexSkillFileSchema], default: [] },
        origin: { type: Schema.Types.Mixed, required: true },
        hash: { type: String, default: null },
        enabled: { type: Boolean, default: true },
        size: { type: Number, default: 0 },
    },
    { collection: "opex_skills", versionKey: false, timestamps: true, minimize: false },
)
OpexSkillSchema.index({ name: 1 }, { unique: true })

if (process.env.NODE_ENV === "development") {
    delete models.OpexSkill
    delete models.OpexMcpServer
    delete models.OpexJob
    delete models.OpexWatch
    delete models.OpexWatchFact
    delete models.OpexFile
    delete models.OpexSession
    delete models.OpexMessage
    delete models.OpexPendingAction
}

export const OpexSession: Model<IOpexSession> = (models.OpexSession as Model<IOpexSession>) || model<IOpexSession>("OpexSession", OpexSessionSchema)
export const OpexMessage: Model<IOpexMessage> = (models.OpexMessage as Model<IOpexMessage>) || model<IOpexMessage>("OpexMessage", OpexMessageSchema)
export const OpexFile: Model<IOpexFile> = (models.OpexFile as Model<IOpexFile>) || model<IOpexFile>("OpexFile", OpexFileSchema)
export const OpexJob: Model<IOpexJob> = (models.OpexJob as Model<IOpexJob>) || model<IOpexJob>("OpexJob", OpexJobSchema)
export const OpexWatch: Model<IOpexWatch> = (models.OpexWatch as Model<IOpexWatch>) || model<IOpexWatch>("OpexWatch", OpexWatchSchema)
export const OpexWatchFact: Model<IOpexWatchFact> = (models.OpexWatchFact as Model<IOpexWatchFact>) || model<IOpexWatchFact>("OpexWatchFact", OpexWatchFactSchema)
export const OpexPendingAction: Model<IOpexPendingAction> =
    (models.OpexPendingAction as Model<IOpexPendingAction>) || model<IOpexPendingAction>("OpexPendingAction", OpexPendingActionSchema)
export const OpexMcpServer: Model<IOpexMcpServer> = (models.OpexMcpServer as Model<IOpexMcpServer>) || model<IOpexMcpServer>("OpexMcpServer", OpexMcpServerSchema)
export const OpexSkill: Model<IOpexSkill> = (models.OpexSkill as Model<IOpexSkill>) || model<IOpexSkill>("OpexSkill", OpexSkillSchema)
