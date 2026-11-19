import { describe, expect, it } from "vitest"
import { compilePluginSources } from "@/features/plugins/server/compiler/rolldown"
import { extractClassCandidates } from "@/features/plugins/server/compiler/tailwind"
import { parsePluginManifest } from "@/features/plugins/manifest"
import { ownerPluginFiles } from "./fixtures"

/** Compilação real com Rolldown (binário local) e o compilador do Tailwind (OPE-172). */

function manifestOf(files: ReturnType<typeof ownerPluginFiles>) {
    const parsed = parsePluginManifest(files)
    if (!parsed.ok) throw new Error(parsed.issues.join("\n"))
    return parsed.manifest
}

describe("compilação dos plugins (Rolldown)", () => {
    it("compila servidor e cliente: compartilhados viram marcadores e o CSS traz as classes do plugin", async () => {
        const files = ownerPluginFiles()
        const result = await compilePluginSources(files, manifestOf(files))
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.client?.code).toContain('from "opex-shared:react"')
        expect(result.client?.code).toContain('from "opex-shared:@opex/ui/card"')
        expect(result.client?.code).toContain('"opex-shared:react/jsx-runtime"')
        expect(result.client?.css).toContain(".bg-primary\\/20")
        expect(result.server?.code).toContain("const definePlugin")
        expect(result.server?.code).not.toContain("@opex/plugin-sdk/server")
        expect(result.server?.hash).toMatch(/^[0-9a-f]{16}$/)
    }, 30_000)

    it("recusa dependência npm e módulo do Opex inexistente com mensagem pt-BR", async () => {
        const files = ownerPluginFiles({ client: `import _ from "lodash"\nimport { X } from "@opex/ui/nao-existe"\nexport default { slots: { Widget: () => _(X) } }\n` })
        const result = await compilePluginSources(files, manifestOf(files))
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.errors).toContain('Dependência não permitida no plugin: "lodash" (use os módulos compartilhados do Opex)')
        expect(result.errors).toContain('Módulo do Opex inexistente: "@opex/ui/nao-existe"')
    }, 30_000)

    it("devolve o erro de sintaxe do Rolldown", async () => {
        const files = ownerPluginFiles({ server: "export default {{{" })
        const result = await compilePluginSources(files, manifestOf(files))
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.errors.join("\n")).toContain("Erro de compilação")
    }, 30_000)

    it("candidatos a classe ignoram os testes do plugin", () => {
        const candidates = extractClassCandidates([
            { path: "client/a.tsx", content: '<div className="p-3 text-primary" />' },
            { path: "client/a.test.tsx", content: '"bg-red-900"' },
        ])
        expect(candidates).toContain("p-3")
        expect(candidates).not.toContain("bg-red-900")
    })
})
