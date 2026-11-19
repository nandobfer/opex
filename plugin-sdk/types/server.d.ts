/**
 * SDK de servidor dos plugins do Opex (apiVersion 1.0, OPE-172). Só plugins do DONO têm servidor.
 *
 * O servidor do plugin exporta por padrão `definePlugin({ inject, apply })`. `apply(ctx)` roda numa
 * fiber do kernel (Cordis): tudo o que for registrado nos serviços do `ctx` (ferramentas, rotas,
 * crons) é desfeito sozinho quando o plugin é recarregado, desativado ou volta de versão.
 * Rotas, ferramentas, crons e serviços usados precisam estar declarados no plugin.json.
 */
declare module "@opex/plugin-sdk/server" {
    import type { ZodType } from "zod"

    export type ServiceName = "db" | "log" | "audit" | "realtime" | "integrations" | "ai" | "tools" | "cron" | "routes" | "kv" | "sdk"

    export interface ToolContext {
        /** Sessão do agente (vazia quando a chamada veio por token de sistema). */
        sessionId: string
        actorId: string
        signal?: AbortSignal
    }

    export interface ToolDef<I = unknown> {
        /** Nome declarado em plugin.json (`tools`); o agente vê `plugin_{id}_{nome}`. */
        name: string
        /** Rótulo curto em pt-BR (card da ferramenta). */
        label: string
        description: string
        /** `read` nunca pede confirmação; `destructive` pede por padrão. Padrão: `write`. */
        risk?: "read" | "write" | "destructive"
        input: ZodType<I>
        execute(input: I, context: ToolContext): Promise<unknown> | unknown
    }

    export type Schedule = { type: "interval"; minutes: number } | { type: "daily"; time: string } | { type: "weekly"; days: number[]; time: string } | { type: "monthly"; day: number; time: string }

    export interface RouteRequest {
        req: Request
        /** Parâmetros `:nome` do caminho declarado. */
        params: Record<string, string>
        path: string
    }
    /** Devolva um `Response` ou um valor (vira `{ success: true, data }`). */
    export type RouteHandler = (request: RouteRequest) => unknown

    export interface PluginContext {
        db: { connect(): Promise<unknown>; readonly mongoose: unknown; model<T = unknown>(name: string): unknown }
        log: { info(message: string, data?: Record<string, unknown>): void; warn(message: string, data?: Record<string, unknown>): void; error(message: string, data?: Record<string, unknown>): void; debug(message: string, data?: Record<string, unknown>): void }
        audit: { record(input: { acao: "CRIAR" | "ATUALIZAR" | "EXCLUIR" | "EXECUTAR"; entidadeId: string; antes?: Record<string, unknown>; depois?: Record<string, unknown> }): Promise<void> }
        /** Evento no canal do dono; o cliente do plugin escuta com `usePluginEvent(event)`. */
        realtime: { publish(event: string, data?: Record<string, unknown>): Promise<void> }
        integrations: { get(id: string): Promise<unknown> }
        ai: { text(request: { provider: string; model: string; instructions: string; prompt?: string; messages?: unknown[] }): Promise<string>; stream(request: unknown): AsyncGenerator<{ type: string; text?: string }> }
        tools: { register<I>(def: ToolDef<I>): void }
        /** Crons em minutos (tick do agendador, com lease). Na prévia só registram, não rodam. */
        cron: { schedule(name: string, schedule: Schedule, run: () => unknown): void }
        /** Rotas em `/api/p/{id}{path}` (sessão do dono). */
        routes: { on(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, handler: RouteHandler): void; get(path: string, handler: RouteHandler): void; post(path: string, handler: RouteHandler): void }
        kv: { get<T = unknown>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void>; list(prefix?: string): Promise<Array<{ key: string; value: unknown }>> }
        sdk: { readonly z: typeof import("zod").z; readonly dateFns: typeof import("date-fns"); readonly ptBR: unknown }
        /** Eventos entre plugins no processo (Cordis); o listener sai com a fiber. */
        on(name: string, listener: (...args: unknown[]) => unknown): () => boolean
        emit(name: string, ...args: unknown[]): void
    }

    export interface PluginDefinition {
        inject?: ServiceName[]
        apply(ctx: PluginContext): void | Promise<void>
    }

    export function definePlugin(plugin: PluginDefinition): PluginDefinition
}
