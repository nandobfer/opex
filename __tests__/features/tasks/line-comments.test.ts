import { describe, expect, it } from "vitest"
import { lineHash } from "@/lib/markdown/lines"
import { resolveLineAnchors } from "@/features/tasks/line-comments/anchors"
import { formatLineComment, TASK_COMMENT_MAX, lineMarkerOf, parseLineComment } from "@/features/tasks/line-comments/format"
import type { TaskLineRef } from "@/features/tasks/types"

const ref = (line: number, quote: string, hash = lineHash(quote)): TaskLineRef => ({ field: "description", commentId: null, line, hash, quote })

describe("comentário de linha — formato do comentário", () => {
    it("ida e volta: citação visível, corpo e marcador oculto", () => {
        const content = formatLineComment("Isto precisa mudar", { field: "technicalSpec", line: 4, text: "- Usar o **serviço X**" }, "opex:line")
        expect(content.startsWith("> 💬 Linha 4 da **Especificação técnica**:\n> - Usar o **serviço X**")).toBe(true)
        expect(content).toMatch(/<!-- opex:line \{.*\} -->$/)
        const parsed = parseLineComment(content, "opex:line")
        expect(parsed.body).toBe("Isto precisa mudar")
        expect(parsed.content).not.toContain("<!--")
        expect(parsed.lineRef).toEqual({ field: "technicalSpec", commentId: null, line: 4, hash: lineHash("- Usar o **serviço X**"), quote: "- Usar o **serviço X**" })
    })

    it("respeita o marcador configurado; outro marcador não é reconhecido", () => {
        const content = formatLineComment("ok", { field: "comment", commentId: "b".repeat(24), line: 1, text: "linha" }, "meu:marcador")
        expect(parseLineComment(content, "meu:marcador").lineRef?.commentId).toBe("b".repeat(24))
        expect(parseLineComment(content, "opex:line").lineRef).toBeNull()
    })

    it("marcador inválido cai no padrão", () => {
        expect(lineMarkerOf("a--b")).toBe("opex:line")
        expect(lineMarkerOf("x>")).toBe("opex:line")
        expect(lineMarkerOf(" valido:1 ")).toBe("valido:1")
    })

    it("JSON quebrado: tira o marcador e vira comentário comum", () => {
        const parsed = parseLineComment("texto\n\n<!-- opex:line {quebrado} -->", "opex:line")
        expect(parsed).toEqual({ content: "texto", body: "texto", lineRef: null })
        expect(parseLineComment("sem marcador", "opex:line")).toEqual({ content: "sem marcador", body: "sem marcador", lineRef: null })
    })

    it("corta a citação longa e recusa quando passa do limite do comentário", () => {
        const content = formatLineComment("ok", { field: "description", line: 1, text: "x".repeat(1000) }, "opex:line")
        expect(parseLineComment(content, "opex:line").lineRef?.quote.length).toBe(300)
        expect(() => formatLineComment("y".repeat(TASK_COMMENT_MAX), { field: "description", line: 1, text: "a" }, "opex:line")).toThrow(RangeError)
    })
})

describe("comentário de linha — reancoragem", () => {
    const md = "Primeira linha\n\n- Item repetido\n- Outro\n- Item repetido\n\nUsar o serviço de pagamentos para cobrar"

    it("hash exato; entre repetidas escolhe a mais próxima da linha original", () => {
        const [first, second] = resolveLineAnchors(md, [ref(1, "Primeira linha"), ref(6, "Item repetido")], (item) => item)
        expect(first).toMatchObject({ line: 1, relocated: false })
        expect(second).toMatchObject({ line: 5, relocated: false })
    })

    it("texto editado: reancora na linha mais parecida", () => {
        const [anchor] = resolveLineAnchors(md, [ref(7, "Usar o serviço de pagamento para cobrar")], (item) => item)
        expect(anchor).toMatchObject({ line: 7, relocated: true })
    })

    it("sem candidata parecida: órfão", () => {
        const [anchor] = resolveLineAnchors(md, [ref(3, "Algo que nunca existiu aqui zzz")], (item) => item)
        expect(anchor).toMatchObject({ line: null, relocated: false })
        expect(resolveLineAnchors("", [ref(1, "x")], (item) => item)[0]?.line).toBeNull()
    })
})
