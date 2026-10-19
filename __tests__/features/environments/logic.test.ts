import { describe, expect, it } from "vitest"
import {
    composeProject,
    environmentFailureHint,
    parseDbEvidence,
    verifyHostResult,
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

describe("falhas conhecidas e conferência no host", () => {
    it("orienta em pt-BR pelos códigos conhecidos", () => {
        expect(environmentFailureHint("HOST_UNREACHABLE")).toContain("Testar acesso ao host")
        expect(environmentFailureHint("COMPOSE_NOT_FOUND")).toContain("arquivo Compose")
        expect(environmentFailureHint(null)).toBeNull()
        expect(environmentFailureHint("ACCESS_ENVELOPE_MISSING")).toBeNull()
    })
    it("lê a versão do banco do último bloco json", () => {
        const text = "x\n```json\n{\"dbVersion\":\"m3\",\"databaseCertain\":true,\"migrations\":[\"m3\"],\"evidence\":[]}\n```"
        expect(parseDbEvidence(text)).toMatchObject({ dbVersion: "m3", databaseCertain: true })
        expect(parseDbEvidence("sem json")).toBeNull()
    })
    it("publicação exige os serviços de pé; restauração exige cada ID imutável", () => {
        const image = { service: "app", imageId: `sha256:${"a".repeat(64)}`, tag: "", version: "", builtAt: "2026-10-16T12:00:00Z" }
        const up = { images: [image], containers: [{ service: "app", state: "running" }] }
        expect(verifyHostResult("publish", up, { services: [] })).toBe(true)
        expect(verifyHostResult("publish", { ...up, containers: [{ service: "app", state: "exited" }] }, { services: [] })).toBe(false)
        expect(verifyHostResult("publish", up, { services: ["app", "worker"] })).toBe(false)
        expect(verifyHostResult("restore", up, { services: [], images: [image] })).toBe(true)
        expect(verifyHostResult("restore", up, { services: [], images: [{ ...image, imageId: `sha256:${"b".repeat(64)}` }] })).toBe(false)
        expect(verifyHostResult("restore", up, { services: [], images: [] })).toBe(false)
        // CD: imagem construída antes do disparo não comprova a nova versão.
        expect(verifyHostResult("publish", up, { services: [], since: new Date("2026-10-16T11:00:00Z") })).toBe(true)
        expect(verifyHostResult("publish", up, { services: [], since: new Date("2026-10-17T00:00:00Z") })).toBe(false)
    })
})
