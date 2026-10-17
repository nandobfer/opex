import { describe, expect, it } from "vitest"
import {
    composeProject,
    parseAgentResult,
    redact,
    restoreCompatibility,
    imageBuiltAt,
} from "@/features/environments/logic"
import {
    environmentSchema,
    operationInputSchema,
    repoConfigSchema,
    DEFAULT_REPO_CONFIG,
} from "@/features/environments/schemas"
import { config, observed } from "./fixtures"

describe("contratos e isolamento de Ambientes", () => {
    it("preserva a data real das imagens e não inventa data quando desconhecida", () => {
        expect(imageBuiltAt(observed.images)?.toISOString()).toBe("2026-10-16T12:00:00.000Z")
        expect(imageBuiltAt([{ ...observed.images[0], builtAt: null }])).toBeNull()
    })
    it("normaliza repositório completo sem misturar organizações", () => {
        expect(composeProject("Org/App", "producao")).toBe("org-app-producao")
        expect(composeProject("Outro/App", "producao")).not.toBe(composeProject("Org/App", "producao"))
    })
    it.each([
        ["m1", "m1", "compatible"],
        ["m1", "m2", "blocked"],
        [null, "m2", "unknown"],
        ["m1", null, "unknown"],
        [null, null, "unknown"],
    ])("banco %s → %s = %s", (from, to, expected) => {
        expect(restoreCompatibility(from, to)).toBe(expected)
    })
    it("aceita o contrato do formulário e rejeita traversal, duplicação e campos injetados", () => {
        expect(environmentSchema.parse(config)).toEqual(config)
        expect(environmentSchema.safeParse({ ...config, directory: "/srv/../etc" }).success).toBe(false)
        expect(environmentSchema.safeParse({ ...config, composeFile: "../other.yml" }).success).toBe(false)
        expect(
            environmentSchema.safeParse({
                ...config,
                variables: [
                    { name: "PORT", value: "1", secret: false },
                    { name: "PORT", value: "2", secret: false },
                ],
            }).success,
        ).toBe(false)
        expect(environmentSchema.safeParse({ ...config, projectId: "alheio" }).success).toBe(false)
    })
    it("exige destino, usuário e known_hosts no modo remoto", () => {
        expect(repoConfigSchema.safeParse({ ...DEFAULT_REPO_CONFIG, mode: "remote" }).success).toBe(false)
        expect(
            repoConfigSchema.safeParse({
                ...DEFAULT_REPO_CONFIG,
                mode: "remote",
                host: "host",
                username: "deploy",
                hostKey: "host ssh-ed25519 key",
            }).success,
        ).toBe(true)
    })
    it("não aceita fim de turno como evidência nem IDs mutáveis de imagem", () => {
        expect(parseAgentResult("Concluído!")).toBeNull()
        expect(
            parseAgentResult(
                JSON.stringify({
                    ...observed,
                    images: [{ service: "app", imageId: "latest", tag: "latest", version: "1" }],
                }),
            ),
        ).toBeNull()
        expect(parseAgentResult(`Texto\n\`\`\`json\n${JSON.stringify(observed)}\n\`\`\``)).toEqual(observed)
        expect(parseAgentResult(JSON.stringify({ ...observed, quiescent: undefined }))).toBeNull()
    })
    it("remove valores conhecidos, tokens e senhas de URLs antes de persistir", () => {
        const result = redact("token=abcd Bearer xyz mongodb://user:pass@host dados super-secreto", ["super-secreto"])
        expect(result).not.toMatch(/abcd|xyz|user:pass|super-secreto/)
        expect(result).toContain("[protegido]")
    })
    it("exige confirmação explícita e impede dados arbitrários na operação", () => {
        expect(
            operationInputSchema.safeParse({
                kind: "publish",
                method: "host",
                confirmation: false,
                expectedRevision: 0,
            }).success,
        ).toBe(false)
    })
})
