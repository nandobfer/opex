import { describe, expect, it } from "vitest"
import { parseComposePsOutput, parseDbVersionText, parseDockerImagesOutput } from "@/features/environments/parsers"

describe("parsers — imagens", () => {
    it("interpreta linhas JSON de `docker images`", () => {
        const output = [
            '{"ID":"sha256:abc","Repository":"opex","Tag":"1.0-20260101000000","CreatedAt":"2026-01-01 00:00:00 +0000 UTC","Size":"120MB"}',
            '{"ID":"sha256:def","Repository":"<none>","Tag":"<none>","CreatedAt":"2026-01-02 00:00:00 +0000 UTC","Size":"80MB"}',
        ].join("\n")
        const images = parseDockerImagesOutput(output)
        expect(images).toHaveLength(2)
        expect(images[0]).toMatchObject({ id: "sha256:abc", repository: "opex", tag: "1.0-20260101000000" })
        expect(images[1]!.tag).toBeNull()
    })

    it("ignora linhas inválidas", () => {
        expect(parseDockerImagesOutput("não é json\n")).toEqual([])
    })
})

describe("parsers — containers", () => {
    it("aceita array JSON de `compose ps`", () => {
        const containers = parseComposePsOutput('[{"Name":"opex-app-1","Service":"app","State":"running","Status":"Up 2 minutes","Image":"opex:latest"}]')
        expect(containers).toEqual([{ name: "opex-app-1", service: "app", state: "running", status: "Up 2 minutes", image: "opex:latest", health: null }])
    })

    it("aceita um objeto JSON por linha", () => {
        const containers = parseComposePsOutput('{"Name":"a","State":"exited"}\n{"Name":"b","State":"running"}')
        expect(containers.map((container) => container.name)).toEqual(["a", "b"])
    })
})

describe("parsers — versão de banco", () => {
    it("lê JSON com `version`", () => {
        expect(parseDbVersionText('{"version":"2026.10"}')).toBe("2026.10")
    })

    it("lê texto simples (primeira linha)", () => {
        expect(parseDbVersionText("  3.1  \nignorado")).toBe("3.1")
    })

    it("devolve null quando vazio", () => {
        expect(parseDbVersionText("   ")).toBeNull()
    })
})
