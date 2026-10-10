import { describe, expect, it } from "vitest"
import { selectPreviewClarity, type PreviewClarityDto } from "@/features/orcamentos/clarity"

const clear: PreviewClarityDto = {
    acceptanceCriteria: { status: "clear", detail: null },
    location: { status: "clear", detail: null },
}

describe("selectPreviewClarity (card da revisão)", () => {
    it("critérios e localização claros → sucesso, submissão liberada", () => {
        const result = selectPreviewClarity(clear)
        expect(result.level).toBe("clear")
        expect(result.canApprove).toBe(true)
        expect(result.issues).toEqual([])
    })

    it("uma dimensão vaga → aviso, submissão liberada", () => {
        const result = selectPreviewClarity({ ...clear, location: { status: "vague", detail: "não diz a página" } })
        expect(result.level).toBe("vague")
        expect(result.canApprove).toBe(true)
        expect(result.issues).toEqual([{ dimension: "location", status: "vague", detail: "não diz a página" }])
    })

    it("dimensão ausente → erro, submissão bloqueada", () => {
        const result = selectPreviewClarity({ ...clear, acceptanceCriteria: { status: "missing", detail: null } })
        expect(result.level).toBe("missing")
        expect(result.canApprove).toBe(false)
        expect(result.issues).toEqual([{ dimension: "acceptanceCriteria", status: "missing", detail: null }])
    })

    it("ambas ausentes → erro e lista as duas dimensões", () => {
        const result = selectPreviewClarity({
            acceptanceCriteria: { status: "missing", detail: null },
            location: { status: "missing", detail: null },
        })
        expect(result.level).toBe("missing")
        expect(result.canApprove).toBe(false)
        expect(result.issues.map((issue) => issue.dimension)).toEqual(["acceptanceCriteria", "location"])
    })

    it("sem avaliação (prévia lida do banco) → aviso, submissão liberada", () => {
        expect(selectPreviewClarity(undefined)).toEqual({ level: "vague", canApprove: true, issues: [] })
        expect(selectPreviewClarity(null)).toEqual({ level: "vague", canApprove: true, issues: [] })
    })

    it("ignora um status inválido e cai em aviso", () => {
        const result = selectPreviewClarity({
            acceptanceCriteria: { status: "invalido" as never, detail: null },
            location: { status: "clear", detail: null },
        })
        expect(result.level).toBe("vague")
        expect(result.canApprove).toBe(true)
    })
})
