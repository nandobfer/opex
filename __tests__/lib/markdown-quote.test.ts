import { describe, expect, it } from "vitest"
import { insertQuote, toQuote } from "@/lib/markdown/quote"

describe("insertQuote", () => {
    it("campo vazio: citação e linha em branco, cursor depois dela", () => {
        expect(insertQuote("", 0, "linha")).toEqual({ value: "> linha\n\n", cursor: 9 })
    })

    it("no meio do texto: separa por linha em branco sem apagar nada", () => {
        const result = insertQuote("antes depois", 5, "x")
        expect(result.value).toBe("antes\n\n> x\n\n depois")
        expect(result.value.slice(result.cursor)).toBe(" depois")
    })

    it("depois de quebra de linha não duplica linhas em branco", () => {
        expect(insertQuote("a\n", 2, "x").value).toBe("a\n\n> x\n\n")
        expect(insertQuote("a\n\n", 3, "x").value).toBe("a\n\n> x\n\n")
    })

    it("cita cada linha de um texto com várias linhas", () => {
        expect(toQuote("a\n\nb")).toBe("> a\n>\n> b")
    })
})
