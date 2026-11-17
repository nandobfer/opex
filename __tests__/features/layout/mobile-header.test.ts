import { describe, expect, it } from "vitest"
import { HEADER_COMPACT_ENTER, HEADER_COMPACT_EXIT, nextHeaderCompact } from "@/features/layout/mobile-header"

describe("nextHeaderCompact — cabeçalho do celular ao rolar (OPE-168)", () => {
    it("no topo a barra fica completa", () => {
        expect(nextHeaderCompact(false, 0)).toBe(false)
        expect(nextHeaderCompact(true, 0)).toBe(false)
    })

    it("recolhe ao passar do limite de descida", () => {
        expect(nextHeaderCompact(false, HEADER_COMPACT_ENTER + 1)).toBe(true)
        expect(nextHeaderCompact(false, 600)).toBe(true)
    })

    it("dentro da folga mantém o estado anterior nos dois sentidos (não pisca)", () => {
        const middle = (HEADER_COMPACT_ENTER + HEADER_COMPACT_EXIT) / 2
        expect(nextHeaderCompact(false, middle)).toBe(false)
        expect(nextHeaderCompact(true, middle)).toBe(true)
        expect(nextHeaderCompact(false, HEADER_COMPACT_ENTER)).toBe(false)
    })

    it("volta ao estado do topo perto do início", () => {
        expect(nextHeaderCompact(true, HEADER_COMPACT_EXIT)).toBe(false)
    })
})
