/**
 * SDK de interface dos plugins do Opex (apiVersion 1.0, OPE-172). O cliente exporta por padrão
 * `definePluginClient({ slots, pages })`; os nomes são os `export` do plugin.json. Interface de
 * plugin = client components (sem Server Components).
 */
declare module "@opex/plugin-sdk/client" {
    import type { ReactNode } from "react"
    import type { AxiosInstance } from "axios"

    export interface PluginHost {
        pluginId: string
        versionNumber: number
        channel: "stable" | "preview"
        scope: "owner" | "client"
        clientId: string | null
        /** Axios do contexto: APIs do dono (`/api`) ou do portal (filtradas pelo cliente da sessão). */
        api: AxiosInstance
        /** Base das rotas do próprio plugin (`/p/{id}`, só no dono; use com `api`). */
        routeBase: string | null
        channel_: string
    }

    /** Props por slot. */
    export interface SlotProps {
        "dashboard.widgets": Record<string, never>
        "task.panel": { task: { id: string; code: string; title: string; taskType: string | null; projectId: string | null } }
        "topbar.actions": Record<string, never>
        "workbench.panel": { workbenchId: string; taskId: string | null }
        "tasks.header": Record<string, never>
        "financeiro.widgets": Record<string, never>
        "portal.dashboard.widgets": { clientId: string }
        "portal.task.panel": { taskId: string; clientId: string }
    }

    export function usePluginHost(): PluginHost
    export function usePluginEvent<T = Record<string, unknown>>(event: string, handler: (data: T) => void): void
    export function definePluginClient<T extends { slots?: Record<string, unknown>; pages?: Record<string, unknown> }>(module: T): T
    export function PluginHostProvider(props: { host: PluginHost; children: ReactNode }): ReactNode
}

declare module "@opex/api" {
    import type { AxiosInstance } from "axios"
    const api: AxiosInstance
    export default api
    export { api }
}

declare module "@opex/plugin-sdk/testing" {
    import type { PluginContext, PluginDefinition } from "@opex/plugin-sdk/server"
    export interface PluginTestContext {
        ctx: PluginContext
        tools: Map<string, unknown>
        crons: Map<string, unknown>
        kv: Map<string, unknown>
        audits: unknown[]
        events: Array<{ event: string; data: Record<string, unknown> }>
        logs: Array<{ level: string; message: string; data?: unknown }>
        activate(plugin: PluginDefinition): Promise<void>
        callTool(name: string, input?: unknown): Promise<unknown>
        callRoute(method: string, path: string, body?: unknown): Promise<unknown>
        runCron(name: string): Promise<unknown>
    }
    export function createPluginTestContext(manifest?: { tools?: string[]; crons?: string[]; routes?: Array<{ method: string; path: string }> }): PluginTestContext
    export function mockApi(method: string, url: string, data: unknown): void
    export function resetApi(): void
    export const apiCalls: Array<{ method: string; url: string; body?: unknown }>
    export function emitPluginEvent(event: string, data: unknown): void
}
