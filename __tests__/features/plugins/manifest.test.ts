import { describe, expect, it } from "vitest"
import { checkPluginApiVersion, normalizePluginFiles, parsePluginManifest } from "@/features/plugins/manifest"
import { ownerPluginFiles } from "./fixtures"

describe("manifesto do plugin", () => {
    it("aceita um plugin do dono completo", () => {
        const result = parsePluginManifest(ownerPluginFiles())
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.manifest.tools).toEqual(["hora_atual"])
            expect(result.manifest.slots[0]?.order).toBe(100)
        }
    })

    it("recusa código de servidor, rotas, crons e ferramentas em plugin de cliente", () => {
        const files = ownerPluginFiles({ manifest: { scope: "client", slots: [{ slot: "portal.dashboard.widgets", export: "Widget" }] } })
        const result = parsePluginManifest(files)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.issues.join("\n")).toContain("Plugin de cliente é só interface; remova: entries.server, routes, crons, tools, services, pasta server/")
    })

    it("recusa slot de outro escopo e item de menu sem página", () => {
        const result = parsePluginManifest(ownerPluginFiles({ manifest: { slots: [{ slot: "portal.dashboard.widgets", export: "Widget" }], nav: [{ label: "Relógio", page: "inexistente" }] } }))
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.issues.some((issue) => issue.includes('O slot "portal.dashboard.widgets" não existe no escopo do dono'))).toBe(true)
            expect(result.issues.some((issue) => issue.includes("página inexistente"))).toBe(true)
        }
    })

    it("explica quando falta o plugin.json ou ele não é JSON", () => {
        expect(parsePluginManifest([])).toEqual({ ok: false, issues: ["Arquivo plugin.json não encontrado na raiz do plugin"] })
        expect(parsePluginManifest([{ path: "plugin.json", content: "{" }])).toEqual({ ok: false, issues: ["plugin.json não é um JSON válido"] })
    })

    it("compatibilidade da apiVersion: major diferente recusa, minor maior avisa", () => {
        expect(checkPluginApiVersion("2.0", "1.0")).toEqual({ ok: false, message: "Plugin incompatível com a versão do núcleo (plugin 2.0, núcleo 1.0)" })
        const newer = checkPluginApiVersion("1.3", "1.0")
        expect(newer.ok && newer.warning).toContain("mais novo que o do núcleo")
        expect(checkPluginApiVersion("1.0", "1.2")).toEqual({ ok: true, warning: null })
    })

    it("descarta o ambiente local (node_modules, SDK exportado, git) ao importar as fontes", () => {
        const files = normalizePluginFiles([
            { path: "./plugin.json", content: "{}" },
            { path: "node_modules/x/index.js", content: "" },
            { path: ".opex-sdk/server.d.ts", content: "" },
            { path: "pnpm-lock.yaml", content: "" },
            { path: "client/a.tsx", content: "a" },
        ])
        expect(files.map((file) => file.path)).toEqual(["client/a.tsx", "plugin.json"])
    })
})
