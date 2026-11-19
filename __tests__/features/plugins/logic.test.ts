import { describe, expect, it } from "vitest"
import { diffPluginFiles, parsePreviewList, pluginIdFromTitle, resolvePluginVersion, togglePreviewList, uniquePluginId, versionActionBlock } from "@/features/plugins/logic"
import { SHARED_MODULE_IDS, isSharedModule, isUnknownSharedModule } from "@/features/plugins/shared-modules"

describe("regras dos plugins", () => {
    const plugin = { active: true, stableVersionId: "s1", previewVersionId: "p1" }

    it("a prévia ligada mostra a versão preview; o resto continua na stable", () => {
        expect(resolvePluginVersion(plugin, true)).toEqual({ versionId: "p1", channel: "preview" })
        expect(resolvePluginVersion(plugin, false)).toEqual({ versionId: "s1", channel: "stable" })
        expect(resolvePluginVersion({ ...plugin, previewVersionId: null }, true)).toEqual({ versionId: "s1", channel: "stable" })
    })

    it("plugin desativado ou sem versão não aparece", () => {
        expect(resolvePluginVersion({ ...plugin, active: false }, true)).toBeNull()
        expect(resolvePluginVersion({ active: true, stableVersionId: null, previewVersionId: null }, false)).toBeNull()
    })

    it("ciclo das versões: só a prévia consolida e o rollback só volta para versão já consolidada", () => {
        expect(versionActionBlock("consolidate", "preview")).toBeNull()
        expect(versionActionBlock("consolidate", "draft")).toBe("Só a versão em prévia pode ser consolidada")
        expect(versionActionBlock("rollback", "archived")).toBeNull()
        expect(versionActionBlock("rollback", "draft")).toBe("O rollback só volta para uma versão já consolidada antes")
        expect(versionActionBlock("rollback", "stable", { isCurrentStable: true })).toBe("Esta já é a versão estável atual")
    })

    it("diff por arquivo entre versões (adicionado, removido e alterado)", () => {
        const diffs = diffPluginFiles(
            [
                { path: "a.ts", content: "um\ndois\n" },
                { path: "b.ts", content: "fica\n" },
                { path: "c.ts", content: "sai\n" },
            ],
            [
                { path: "a.ts", content: "um\ntrês\n" },
                { path: "b.ts", content: "fica\n" },
                { path: "d.ts", content: "entra\n" },
            ],
        )
        expect(diffs.map((diff) => [diff.path, diff.status, diff.additions, diff.deletions])).toEqual([
            ["a.ts", "modified", 1, 1],
            ["c.ts", "removed", 0, 1],
            ["d.ts", "added", 1, 0],
        ])
        expect(diffs[0]?.patch).toContain("+três")
    })

    it("lista da prévia ligada (cookie) ignora ids inválidos e alterna sem repetir", () => {
        expect(parsePreviewList("relogio, x,Inválido,relogio")).toEqual(["relogio"])
        expect(togglePreviewList(["a1"], "relogio", true)).toEqual(["a1", "relogio"])
        expect(togglePreviewList(["a1", "relogio"], "relogio", false)).toEqual(["a1"])
    })

    it("id do plugin a partir do título, com sufixo quando já existe", () => {
        expect(pluginIdFromTitle("Relatório de Horas!")).toBe("relatorio-de-horas")
        expect(pluginIdFromTitle("123 vendas")).toBe("p-123-vendas")
        expect(uniquePluginId("relogio", new Set(["relogio", "relogio-2"]))).toBe("relogio-3")
    })

    it("tabela de módulos compartilhados", () => {
        expect(isSharedModule("react")).toBe(true)
        expect(isSharedModule("@opex/ui/button")).toBe(true)
        expect(isUnknownSharedModule("@opex/ui/nao-existe")).toBe(true)
        expect(new Set(SHARED_MODULE_IDS).size).toBe(SHARED_MODULE_IDS.length)
    })
})
