import { z } from "zod"
import * as dateFns from "date-fns"
import { resetApi, setApiResponse, calls as apiCalls } from "./api.mjs"
import { emitPluginEvent } from "./sdk-client.mjs"

/**
 * Helpers de teste dos plugins do Opex (OPE-172). `createPluginTestContext(manifest)` monta um `ctx`
 * falso com os serviços do kernel, com as MESMAS regras de declaração do plugin.json (ferramenta,
 * rota ou cron não declarados lançam erro) e helpers para chamar o que o plugin registrou.
 */
export function createPluginTestContext(manifest = {}) {
    const declared = { tools: manifest.tools ?? [], crons: manifest.crons ?? [], routes: manifest.routes ?? [] }
    const tools = new Map()
    const routes = []
    const crons = new Map()
    const kv = new Map()
    const audits = []
    const events = []
    const logs = []
    const fail = (message) => {
        throw new Error(message)
    }
    const log = (level) => (message, data) => logs.push({ level, message, data })
    const ctx = {
        db: { connect: async () => fail("O banco não está disponível nos testes do plugin"), mongoose: null, model: () => fail("O banco não está disponível nos testes do plugin") },
        log: { info: log("info"), warn: log("warn"), error: log("error"), debug: log("debug") },
        audit: { record: async (input) => void audits.push(input) },
        realtime: { publish: async (event, data = {}) => void events.push({ event, data }) },
        integrations: { get: async () => ({}) },
        ai: { text: async () => "", stream: async function* () {} },
        tools: {
            register(def) {
                if (!declared.tools.includes(def.name)) fail(`Ferramenta "${def.name}" não declarada em plugin.json (tools)`)
                tools.set(def.name, def)
            },
        },
        cron: {
            schedule(name, schedule, run) {
                if (!declared.crons.includes(name)) fail(`Cron "${name}" não declarado em plugin.json (crons)`)
                crons.set(name, { schedule, run })
            },
        },
        routes: {
            on(method, path, handler) {
                if (!declared.routes.some((route) => route.method === method && route.path === path)) fail(`Rota ${method} ${path} não declarada em plugin.json (routes)`)
                routes.push({ method, path, handler })
            },
            get(path, handler) {
                this.on("GET", path, handler)
            },
            post(path, handler) {
                this.on("POST", path, handler)
            },
        },
        kv: {
            get: async (key) => (kv.has(key) ? kv.get(key) : null),
            set: async (key, value) => void kv.set(key, value),
            delete: async (key) => void kv.delete(key),
            list: async (prefix = "") => [...kv.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })),
        },
        sdk: { z, dateFns, ptBR: null },
        on: () => () => true,
        emit: () => undefined,
    }
    const match = (pattern, path) => {
        const a = pattern.split("/").filter(Boolean)
        const b = path.split("/").filter(Boolean)
        if (a.length !== b.length) return null
        const params = {}
        for (let i = 0; i < a.length; i++) {
            if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i])
            else if (a[i] !== b[i]) return null
        }
        return params
    }
    return {
        ctx,
        tools,
        crons,
        kv,
        audits,
        events,
        logs,
        /** Ativa o plugin (o export padrão do servidor) neste contexto. */
        async activate(plugin) {
            await (typeof plugin === "function" ? plugin(ctx) : plugin.apply(ctx))
        },
        async callTool(name, input = {}) {
            const tool = tools.get(name) ?? fail(`Ferramenta "${name}" não registrada`)
            return tool.execute(tool.input.parse(input), { sessionId: "", actorId: "local" })
        },
        async callRoute(method, path, body) {
            for (const route of routes) {
                const params = route.method === method ? match(route.path, path) : null
                if (!params) continue
                const req = new Request(`http://plugin.test/api/p${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) })
                return route.handler({ req, params, path })
            }
            return fail(`Rota ${method} ${path} não registrada`)
        },
        async runCron(name) {
            const cron = crons.get(name) ?? fail(`Cron "${name}" não registrado`)
            return cron.run()
        },
    }
}

/** Resposta do `@opex/api` falso (`ApiResponse`): `mockApi("get", "/cliente/dashboard", { success: true, data })`. */
export const mockApi = (method, url, data) => setApiResponse(method, url, data)
export { resetApi, apiCalls, emitPluginEvent }
