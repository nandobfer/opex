import { describe, expect, it } from "vitest"
import { mergeImageMetadata } from "@/features/environments/server/images"
import type { ParsedImage } from "@/features/environments/parsers"

const host: ParsedImage[] = [
    { id: "sha256:aaa", repository: "opex", tag: "3-20260101000000", createdAt: "2026-01-01T00:00:00Z", size: "100MB" },
    { id: "sha256:bbb", repository: "opex", tag: "cd-20260102000000", createdAt: "2026-01-02T00:00:00Z", size: "100MB" },
    { id: "sha256:ccc", repository: "opex", tag: null, createdAt: "2026-01-03T00:00:00Z", size: "100MB" },
]

describe("images — merge de metadados", () => {
    it("casa metadados por id e marca origem", () => {
        const merged = mergeImageMetadata(host, [
            { imageId: "sha256:aaa", tag: "3-20260101000000", dbVersion: "3", builtAt: new Date("2026-01-01T00:00:00Z"), origin: "opex", service: "app", commitSha: "abc" },
        ])
        const first = merged.find((image) => image.id === "sha256:aaa")!
        expect(first.origin).toBe("opex")
        expect(first.dbVersion).toBe("3")
        expect(first.commitSha).toBe("abc")
    })

    it("casa por tag quando o id não tem metadado", () => {
        const merged = mergeImageMetadata(host, [
            { imageId: "sha256:zzz", tag: "cd-20260102000000", dbVersion: null, builtAt: null, origin: "cd", service: null, commitSha: null },
        ])
        const byTag = merged.find((image) => image.id === "sha256:bbb")!
        expect(byTag.origin).toBe("cd")
    })

    it("imagem sem metadados fica 'unknown' e usa a data do host", () => {
        const merged = mergeImageMetadata(host, [])
        const unknown = merged.find((image) => image.id === "sha256:ccc")!
        expect(unknown.origin).toBe("unknown")
        expect(unknown.builtAt).toBe("2026-01-03T00:00:00Z")
    })
})
