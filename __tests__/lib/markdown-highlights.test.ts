/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest"
import { COMMENT_HIGHLIGHT, setHighlightRanges } from "@/lib/markdown/highlights"

describe("realces de trecho (Highlight API)", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        document.getElementById("md-highlight-styles")?.remove()
    })

    it("sem suporte do navegador, não faz nada", () => {
        expect(() => setHighlightRanges(COMMENT_HIGHLIGHT, {}, [document.createRange()])).not.toThrow()
        expect(document.getElementById("md-highlight-styles")).toBeNull()
    })

    it("com suporte, injeta o estilo uma vez e registra/remove os intervalos por dono", () => {
        const registry = new Map<string, unknown>()
        vi.stubGlobal("CSS", { highlights: registry })
        vi.stubGlobal(
            "Highlight",
            class {
                ranges: Range[]
                constructor(...ranges: Range[]) {
                    this.ranges = ranges
                }
            },
        )
        const owner = {}
        setHighlightRanges(COMMENT_HIGHLIGHT, owner, [document.createRange()])
        setHighlightRanges(COMMENT_HIGHLIGHT, {}, [document.createRange()])
        expect(document.querySelectorAll("#md-highlight-styles")).toHaveLength(1)
        expect(document.getElementById("md-highlight-styles")!.textContent).toContain(`::highlight(${COMMENT_HIGHLIGHT})`)
        expect((registry.get(COMMENT_HIGHLIGHT) as { ranges: Range[] }).ranges).toHaveLength(2)
        setHighlightRanges(COMMENT_HIGHLIGHT, owner, [])
        expect((registry.get(COMMENT_HIGHLIGHT) as { ranges: Range[] }).ranges).toHaveLength(1)
    })
})
