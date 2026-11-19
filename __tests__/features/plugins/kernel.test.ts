import { afterEach, describe, expect, it } from "vitest"
import { compilePluginSources } from "@/features/plugins/server/compiler/rolldown"
import { activatePluginServer, deactivatePluginServer, inspectPluginRuntime, resetPluginKernelForTests } from "@/features/plugins/server/kernel/kernel"
import { findPluginRoute, pluginToolList } from "@/features/plugins/server/kernel/registries"
import { parsePluginManifest } from "@/features/plugins/manifest"
import type { PluginChannel } from "@/features/plugins/constants"
import { ownerPluginFiles } from "./fixtures"

/** Kernel Cordis real com artefatos compilados pelo Rolldown (OPE-172). */

async function build(options: Parameters<typeof ownerPluginFiles>[0] = {}) {
    const files = ownerPluginFiles(options)
    const parsed = parsePluginManifest(files)
    if (!parsed.ok) throw new Error(parsed.issues.join("\n"))
    const compiled = await compilePluginSources(files, parsed.manifest)
    if (!compiled.ok) throw new Error(compiled.errors.join("\n"))
    return { manifest: parsed.manifest, artifact: compiled.server }
}

async function activate(versionId: string, built: Awaited<ReturnType<typeof build>>, channel: PluginChannel = "stable", pluginId = "relogio") {
    return activatePluginServer({ pluginId, channel, versionId, manifest: built.manifest, artifact: built.artifact })
}

afterEach(async () => {
    delete process.env.OPEX_PREVIEW
    await resetPluginKernelForTests()
})

describe("kernel de plugins (Cordis)", () => {
    it("ativar registra ferramenta, rota e cron; desativar remove tudo sem resíduo", async () => {
        const built = await build()
        expect(await activate("v1", built)).toEqual({ ok: true, warning: null })

        expect(pluginToolList().map((tool) => tool.name)).toEqual(["plugin_relogio_hora_atual"])
        const tool = pluginToolList()[0]!
        expect(tool.group).toBe("plugin-tools")
        expect(await tool.execute({}, { sessionId: "", actorId: "local" })).toEqual({ hora: "12:00" })
        const route = findPluginRoute("relogio", "GET", "/hora", "stable")
        expect(await route?.entry.handler({ req: new Request("http://x"), params: route.params, path: "/hora" })).toEqual({ hora: "12:00" })

        const runtime = await inspectPluginRuntime()
        expect(runtime.fibers.map((fiber) => [fiber.pluginId, fiber.channel, fiber.versionId])).toEqual([["relogio", "stable", "v1"]])
        expect(runtime.fibers[0]?.effects).toEqual(expect.arrayContaining(["tool:hora_atual", "route:GET /hora", "cron:tique"]))
        expect(runtime.crons).toEqual([{ name: "tique", pluginId: "relogio", channel: "stable", scheduled: true }])

        await deactivatePluginServer("relogio")
        expect(pluginToolList()).toEqual([])
        expect(findPluginRoute("relogio", "GET", "/hora", "stable")).toBeNull()
        expect((await inspectPluginRuntime()).crons).toEqual([])
    }, 30_000)

    it("recarga transacional: falha na ativação mantém a versão anterior", async () => {
        await activate("v1", await build())
        const broken = await build({ server: `export default { inject: [], apply() { throw new Error("quebrou") } }\n` })
        const result = await activate("v2", broken)
        expect(result).toEqual({ ok: false, error: "Falha ao ativar o plugin: quebrou" })
        expect(pluginToolList().map((tool) => tool.name)).toEqual(["plugin_relogio_hora_atual"])
        expect((await inspectPluginRuntime()).fibers[0]?.versionId).toBe("v1")
    }, 30_000)

    it("registro não declarado no manifesto falha a ativação (restritivo)", async () => {
        const built = await build({ manifest: { tools: [] } })
        const result = await activate("v1", built)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('Ferramenta "hora_atual" não declarada em plugin.json (tools)')
        expect(pluginToolList()).toEqual([])
    }, 30_000)

    it("erro de um plugin não afeta outro", async () => {
        await activate("v1", await build())
        const other = await build({ manifest: { id: "outro" }, server: `export default () => { throw new Error("x") }\n` })
        expect((await activate("o1", other, "stable", "outro")).ok).toBe(false)
        expect(pluginToolList().map((tool) => tool.name)).toEqual(["plugin_relogio_hora_atual"])
    }, 30_000)

    it("a prévia roda numa fiber isolada: ferramentas só no turno com a prévia ligada e crons sem agendar", async () => {
        await activate("v1", await build())
        const preview = await build({ server: ownerPluginFiles()[1]!.content.replace('"12:00"', '"12:00"').replace("horaLabel() })", '"prévia" })') })
        expect((await activate("v2", preview, "preview")).ok).toBe(true)

        const stableTool = pluginToolList()[0]!
        expect(await stableTool.execute({}, { sessionId: "", actorId: "local" })).toEqual({ hora: "12:00" })
        const previewTool = pluginToolList(new Set(["relogio"]))[0]!
        expect(await previewTool.execute({}, { sessionId: "", actorId: "local" })).toEqual({ hora: "prévia" })
        expect((await inspectPluginRuntime()).crons.find((cron) => cron.channel === "preview")?.scheduled).toBe(false)

        await deactivatePluginServer("relogio", "preview")
        expect(pluginToolList(new Set(["relogio"])).map((tool) => tool.name)).toEqual(["plugin_relogio_hora_atual"])
    }, 30_000)

    it("instância de prévia do app não ativa código de servidor de plugin", async () => {
        process.env.OPEX_PREVIEW = "1"
        expect(await activate("v1", await build())).toEqual({ ok: true, skipped: "preview-instance" })
        expect(pluginToolList()).toEqual([])
        expect((await inspectPluginRuntime()).mode).toBe("preview-instance")
    }, 30_000)

    it("recusa plugin com apiVersion incompatível", async () => {
        const built = await build({ manifest: { apiVersion: "1.0" } })
        const result = await activatePluginServer({ pluginId: "relogio", channel: "stable", versionId: "v9", manifest: { ...built.manifest, apiVersion: "2.0" }, artifact: built.artifact })
        expect(result).toEqual({ ok: false, error: "Plugin incompatível com a versão do núcleo (plugin 2.0, núcleo 1.0)" })
    }, 30_000)
})
