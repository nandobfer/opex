import mongoose from "mongoose"
import { z, type ZodType } from "zod"
import * as dateFns from "date-fns"
import { ptBR } from "date-fns/locale"
import { pluginToolName, type PluginRouteMethod } from "../../constants"
import type { OpexTool, OpexToolContext, OpexToolRisk } from "@/features/opex-agent/server/tools/define"
import { isSecondsSchedule, validateSchedule, type Schedule } from "@/lib/integrations/schedule"
import { loggerFor } from "@/lib/logger"
import { Service, fiberEffect, type Context } from "./cordis"
import { requirePluginMeta } from "./identity"
import { cronKey, pluginRegistries, routeKey, toolKey, type PluginRouteHandler } from "./registries"

/**
 * Serviços do núcleo expostos aos plugins do dono como serviços Cordis (OPE-172). `this.ctx` é o
 * contexto de quem chamou: tudo o que o plugin registra (ferramenta, rota, cron) vira um efeito da
 * fiber dele e é desfeito no `dispose` — recarregar ou desligar não deixa resíduo.
 *
 * Restritivo por padrão: registrar rota, ferramenta ou cron NÃO declarado no manifesto lança erro (a
 * ativação falha e a versão anterior continua).
 */

export class PluginDeclarationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "PluginDeclarationError"
    }
}

/** Banco: conexão (com migrações) e o Mongoose do app (modelos registrados em `mongoose.models`). */
export class DbService extends Service {
    constructor(ctx: Context) {
        super(ctx, "db")
    }
    async connect() {
        const { dbConnect } = await import("@/lib/db")
        await dbConnect()
        return mongoose
    }
    get mongoose() {
        return mongoose
    }
    model<T = unknown>(name: string): mongoose.Model<T> {
        const model = mongoose.models[name]
        if (!model) throw new Error(`Modelo "${name}" não registrado`)
        return model as mongoose.Model<T>
    }
}

/** Logger estruturado (Pino) com o id do plugin. */
export class LogService extends Service {
    constructor(ctx: Context) {
        super(ctx, "log")
    }
    private get logger() {
        const meta = requirePluginMeta(this.ctx, "log")
        return loggerFor({ module: "plugin", plugin: meta.pluginId, channel: meta.channel })
    }
    info(message: string, data: Record<string, unknown> = {}) {
        this.logger.info(data, message)
    }
    warn(message: string, data: Record<string, unknown> = {}) {
        this.logger.warn(data, message)
    }
    error(message: string, data: Record<string, unknown> = {}) {
        this.logger.error(data, message)
    }
    debug(message: string, data: Record<string, unknown> = {}) {
        this.logger.debug(data, message)
    }
}

export interface PluginAuditInput {
    acao: "CRIAR" | "ATUALIZAR" | "EXCLUIR" | "EXECUTAR"
    entidadeId: string
    antes?: Record<string, unknown>
    depois?: Record<string, unknown>
}

/** Auditoria (`recordAudit`) com a entidade `plugin:{id}` e o usuário local. */
export class AuditService extends Service {
    constructor(ctx: Context) {
        super(ctx, "audit")
    }
    async record(input: PluginAuditInput) {
        const meta = requirePluginMeta(this.ctx, "audit")
        const [{ recordAudit }, { getLocalUser }] = await Promise.all([import("@/lib/audit/record"), import("@/lib/local-user")])
        await recordAudit({ userId: getLocalUser().id, entidade: `plugin:${meta.pluginId}`, entidadeId: input.entidadeId, acao: input.acao, antes: input.antes, depois: input.depois })
    }
}

/** Evento de plugin no canal do dono: `plugin-event` com `{ pluginId, event, data }`. */
export const PLUGIN_EVENT = "plugin-event"

/** Tempo real (Pusher, `private-app`): o cliente do plugin escuta com `usePluginEvent(event)`. */
export class RealtimeService extends Service {
    constructor(ctx: Context) {
        super(ctx, "realtime")
    }
    async publish(event: string, data: Record<string, unknown> = {}) {
        const meta = requirePluginMeta(this.ctx, "realtime")
        const { publishAppEvent } = await import("@/lib/pusher/channels")
        await publishAppEvent(PLUGIN_EVENT, { pluginId: meta.pluginId, event, data })
    }
}

/** Integrações configuradas em `/integracoes` (leitura). */
export class IntegrationsService extends Service {
    constructor(ctx: Context) {
        super(ctx, "integrations")
    }
    async get(id: string): Promise<unknown> {
        const { getIntegrationConfig } = await import("@/lib/integrations/config")
        return getIntegrationConfig(id as never)
    }
}

/** IA pelos provedores configurados (`streamAi`). */
export class AiService extends Service {
    constructor(ctx: Context) {
        super(ctx, "ai")
    }
    async *stream(request: import("@/lib/ai/stream").AiStreamRequest) {
        const { streamAi } = await import("@/lib/ai/stream")
        yield* streamAi(request)
    }
    /** Texto completo de uma resposta (atalho sobre `stream`). */
    async text(request: import("@/lib/ai/stream").AiStreamRequest): Promise<string> {
        let text = ""
        for await (const event of this.stream(request)) if (event.type === "delta") text += event.text
        return text
    }
}

export interface PluginToolDef<I = unknown> {
    /** Nome declarado em `manifest.tools` (o catálogo usa `plugin_{id}_{nome}`). */
    name: string
    label: string
    description: string
    risk?: OpexToolRisk
    input: ZodType<I>
    execute(input: I, context: OpexToolContext): Promise<unknown> | unknown
}

/** Risco efetivo de uma ferramenta de plugin: nunca "read" (o código do plugin roda no processo do Opex). */
export const pluginToolRisk = (declared: OpexToolRisk | undefined): OpexToolRisk => (declared === "destructive" ? "destructive" : "write")

/** Ferramentas do Agente Opex e do MCP `opex_app` (grupo `plugin-tools`). */
export class ToolsService extends Service {
    constructor(ctx: Context) {
        super(ctx, "tools")
    }
    register<I>(def: PluginToolDef<I>): void {
        const meta = requirePluginMeta(this.ctx, "tools")
        if (!meta.manifest.tools.includes(def.name)) throw new PluginDeclarationError(`Ferramenta "${def.name}" não declarada em plugin.json (tools)`)
        const name = pluginToolName(meta.pluginId, def.name)
        const tool: OpexTool = {
            name,
            group: "plugin-tools",
            label: def.label,
            description: `[Plugin ${meta.manifest.name}] ${def.description}`,
            // O plugin não decide a própria proteção: "read" (ou omitido) vira "write", e toda ferramenta de
            // plugin pede Confirmar/Cancelar por padrão (no MCP, exige `mcp:owner:destructive`). Só o dono
            // libera uma a uma, no ajuste de confirmação do Agente Opex.
            risk: pluginToolRisk(def.risk),
            confirmByDefault: true,
            input: def.input as ZodType<unknown>,
            execute: async (input, context) => (def.execute as (value: unknown, ctx: OpexToolContext) => unknown)(input, context),
        }
        fiberEffect(this.ctx, `tool:${def.name}`, () => pluginRegistries().tools.add(toolKey(meta.channel, name), meta, tool))
    }
}

/** Crons do agendador interno (tick de minuto, com lease). Na fiber de prévia só registram. */
export class CronService extends Service {
    constructor(ctx: Context) {
        super(ctx, "cron")
    }
    schedule(name: string, schedule: Schedule, run: () => Promise<unknown> | unknown): void {
        const meta = requirePluginMeta(this.ctx, "cron")
        if (!meta.manifest.crons.includes(name)) throw new PluginDeclarationError(`Cron "${name}" não declarado em plugin.json (crons)`)
        const invalid = validateSchedule(schedule)
        if (invalid) throw new PluginDeclarationError(`Cron "${name}": ${invalid}`)
        if (isSecondsSchedule(schedule)) throw new PluginDeclarationError(`Cron "${name}": plugins usam intervalos em minutos`)
        fiberEffect(this.ctx, `cron:${name}`, () => pluginRegistries().crons.add(cronKey(meta.channel, meta.pluginId, name), meta, { name, schedule, run, scheduled: meta.channel === "stable" }))
    }
}

/** Rotas HTTP em `/api/p/{pluginId}/...` (só o dono, sessão de admin). */
export class RoutesService extends Service {
    constructor(ctx: Context) {
        super(ctx, "routes")
    }
    on(method: PluginRouteMethod, path: string, handler: PluginRouteHandler): void {
        const meta = requirePluginMeta(this.ctx, "routes")
        const declared = meta.manifest.routes.some((route) => route.method === method && route.path === path)
        if (!declared) throw new PluginDeclarationError(`Rota ${method} ${path} não declarada em plugin.json (routes)`)
        fiberEffect(this.ctx, `route:${method} ${path}`, () => pluginRegistries().routes.add(routeKey(meta.channel, meta.pluginId, method, path), meta, { method, path, handler }))
    }
    get(path: string, handler: PluginRouteHandler) {
        this.on("GET", path, handler)
    }
    post(path: string, handler: PluginRouteHandler) {
        this.on("POST", path, handler)
    }
}

/** Chave-valor do próprio plugin (`plugin_kv`). */
export class KvService extends Service {
    constructor(ctx: Context) {
        super(ctx, "kv")
    }
    private async model() {
        const [{ dbConnect }, { PluginKv }] = await Promise.all([import("@/lib/db"), import("@/lib/db/models/Plugin")])
        await dbConnect()
        return PluginKv
    }
    async get<T = unknown>(key: string): Promise<T | null> {
        const { pluginId } = requirePluginMeta(this.ctx, "kv")
        const doc = await (await this.model()).findOne({ pluginId, key }).lean()
        return (doc?.value as T | undefined) ?? null
    }
    async set(key: string, value: unknown): Promise<void> {
        const { pluginId } = requirePluginMeta(this.ctx, "kv")
        await (await this.model()).updateOne({ pluginId, key }, { $set: { value } }, { upsert: true })
    }
    async delete(key: string): Promise<void> {
        const { pluginId } = requirePluginMeta(this.ctx, "kv")
        await (await this.model()).deleteOne({ pluginId, key })
    }
    async list(prefix = ""): Promise<Array<{ key: string; value: unknown }>> {
        const { pluginId } = requirePluginMeta(this.ctx, "kv")
        const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const docs = await (await this.model()).find({ pluginId, key: { $regex: `^${escaped}` } }).sort({ key: 1 }).lean()
        return docs.map((doc) => ({ key: doc.key, value: doc.value }))
    }
}

/** Bibliotecas do núcleo para o servidor do plugin (sem dependência npm própria). */
export class SdkService extends Service {
    constructor(ctx: Context) {
        super(ctx, "sdk")
    }
    get z() {
        return z
    }
    get dateFns() {
        return dateFns
    }
    get ptBR() {
        return ptBR
    }
}

export const CORE_SERVICES = [DbService, LogService, AuditService, RealtimeService, IntegrationsService, AiService, ToolsService, CronService, RoutesService, KvService, SdkService] as const
