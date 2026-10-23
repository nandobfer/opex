import { describe, expect, it } from "vitest"
import { lineHash } from "@/lib/markdown/lines"
import { resolveLineAnchors } from "@/features/tasks/line-comments/anchors"
import { formatLineComment, TASK_COMMENT_MAX, lineMarkerOf, parseLineComment } from "@/features/tasks/line-comments/format"
import type { TaskLineRef } from "@/features/tasks/types"

const ref = (line: number, quote: string, hash = lineHash(quote), selection: TaskLineRef["selection"] = null): TaskLineRef => ({ field: "description", commentId: null, line, hash, quote, selection })

describe("comentário de linha — formato do comentário", () => {
    it("ida e volta: citação visível, corpo e marcador oculto", () => {
        const content = formatLineComment("Isto precisa mudar", { field: "technicalSpec", line: 4, text: "- Usar o **serviço X**" }, "opex:line")
        expect(content.startsWith("> 💬 Linha 4 da **Especificação técnica**:\n> - Usar o **serviço X**")).toBe(true)
        expect(content).toMatch(/<!-- opex:line \{.*\} -->$/)
        const parsed = parseLineComment(content, "opex:line")
        expect(parsed.body).toBe("Isto precisa mudar")
        expect(parsed.content).not.toContain("<!--")
        expect(parsed.lineRef).toEqual({ field: "technicalSpec", commentId: null, line: 4, hash: lineHash("- Usar o **serviço X**"), quote: "- Usar o **serviço X**", selection: null })
    })

    it("trecho (v2): cabeçalho com o intervalo, citação do trecho e seleção de volta no parse", () => {
        const selection = { text: "serviço X -->\ncomo <b>", lines: 2, occurrence: 1, startLine: 3 }
        const content = formatLineComment("Revisar", { field: "description", line: 4, text: "linha âncora", selection })
        expect(content.startsWith("> 💬 Trecho das linhas 3–4 da **Descrição**:\n> serviço X -->\n> como <b>\n\nRevisar")).toBe(true)
        expect(content.match(/-->/g)).toHaveLength(2)
        const parsed = parseLineComment(content)
        expect(parsed.body).toBe("Revisar")
        expect(parsed.lineRef).toMatchObject({ line: 4, hash: lineHash("linha âncora"), selection: { text: "serviço X -->\ncomo <b>", lines: 2, occurrence: 1 } })
        const single = formatLineComment("ok", { field: "comment", commentId: "b".repeat(24), line: 2, text: "x", selection: { ...selection, lines: 1, startLine: 2 } })
        expect(single.startsWith("> 💬 Trecho da linha 2 de um **comentário**:")).toBe(true)
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

    it("trecho: presente na linha; sumido fica só na linha; linha mudou mas o trecho existe reancora nele", () => {
        const text = "Usar o **serviço** de pagamentos"
        const doc = `${text}\n\nOutra linha com cobrança mensal`
        const sel = (selected: string) => ({ text: selected, lines: 1, occurrence: 0 })
        const [present, missing] = resolveLineAnchors(doc, [ref(1, "serviço de", lineHash(text), sel("serviço de")), ref(1, "boleto", lineHash(text), sel("boleto"))], (item) => item)
        expect(present).toMatchObject({ line: 1, relocated: false, selectionMissing: false })
        expect(missing).toMatchObject({ line: 1, selectionMissing: true })
        const [moved] = resolveLineAnchors(doc, [ref(1, "cobrança mensal", lineHash("texto antigo"), sel("cobrança mensal"))], (item) => item)
        expect(moved).toMatchObject({ line: 3, relocated: true, selectionMissing: false })
    })
})
