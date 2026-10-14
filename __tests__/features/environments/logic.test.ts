import { describe, expect, it } from "vitest"
import {
    buildImageTag,
    checkRestoreCompatibility,
    composeProjectName,
    findComposeIsolationConflicts,
    normalizeDbVersion,
    sanitizeDockerTag,
    slugify,
    summarizeCompose,
} from "@/features/environments/logic"

describe("logic — nomes e tags", () => {
    it("slugify normaliza acentos e símbolos e usa reserva quando vazio", () => {
        expect(slugify("Aplicação Web")).toBe("aplicacao-web")
        expect(slugify("owner/repo")).toBe("owner-repo")
        expect(slugify("!!!")).toBe("x")
        expect(slugify("!!!", "repo")).toBe("repo")
    })

    it("composeProjectName isola por repositório e ambiente", () => {
        expect(composeProjectName("nandobfer/opex", "Produção")).toBe("nandobfer-opex-producao")
    })

    it("sanitizeDockerTag aceita apenas caracteres válidos e nunca fica vazia", () => {
        expect(sanitizeDockerTag("v1.2.3+meta")).toBe("v1.2.3-meta")
        expect(sanitizeDockerTag("---")).toBe("latest")
    })

    it("buildImageTag compõe <versão>-<timestamp UTC>", () => {
        const tag = buildImageTag("2026.10", new Date("2026-10-14T12:34:56Z"))
        expect(tag).toBe("2026.10-20261014123456")
    })

    it("buildImageTag usa 'unknown' sem versão", () => {
        expect(buildImageTag(null, new Date("2026-01-01T00:00:00Z"))).toBe("unknown-20260101000000")
    })

    it("normalizeDbVersion aceita número e string e descarta vazios", () => {
        expect(normalizeDbVersion(" 3 ")).toBe("3")
        expect(normalizeDbVersion(4)).toBe("4")
        expect(normalizeDbVersion("")).toBeNull()
        expect(normalizeDbVersion(null)).toBeNull()
    })
})

describe("logic — compatibilidade de restauração", () => {
    it("schema igual e origem Opex libera", () => {
        const result = checkRestoreCompatibility({ appliedVersion: "3", imageVersion: "3", origin: "opex", confirmUnverified: false })
        expect(result.level).toBe("compatible")
        expect(result.allowed).toBe(true)
        expect(result.requiresConfirmation).toBe(false)
    })

    it("schema conhecido diferente bloqueia", () => {
        const result = checkRestoreCompatibility({ appliedVersion: "4", imageVersion: "3", origin: "opex", confirmUnverified: true })
        expect(result.level).toBe("blocked")
        expect(result.allowed).toBe(false)
        expect(result.message).toContain("3")
    })

    it("imagem do CD pede confirmação mesmo com schema igual", () => {
        const blocked = checkRestoreCompatibility({ appliedVersion: "3", imageVersion: "3", origin: "cd", confirmUnverified: false })
        expect(blocked.level).toBe("confirm")
        expect(blocked.allowed).toBe(false)
        expect(blocked.requiresConfirmation).toBe(true)

        const confirmed = checkRestoreCompatibility({ appliedVersion: "3", imageVersion: "3", origin: "cd", confirmUnverified: true })
        expect(confirmed.allowed).toBe(true)
    })

    it("schema desconhecido nunca libera silenciosamente", () => {
        const result = checkRestoreCompatibility({ appliedVersion: null, imageVersion: "3", origin: "opex", confirmUnverified: false })
        expect(result.level).toBe("confirm")
        expect(result.allowed).toBe(false)
        expect(result.message).toContain("desconhecido")
    })
})

describe("logic — docker-compose", () => {
    const compose = {
        services: {
            app: {
                image: "opex:latest",
                ports: ["3000:3000"],
                environment: { NODE_ENV: "production" },
                depends_on: ["db"],
            },
            db: { image: "mongo:7", container_name: "opex-db" },
        },
        volumes: { data: { external: true } },
        networks: { default: {} },
    }

    it("summarizeCompose extrai serviços, portas e variáveis", () => {
        const summary = summarizeCompose(compose, "docker-compose.yml")
        expect(summary.services.map((service) => service.name)).toEqual(["app", "db"])
        const app = summary.services[0]!
        expect(app.image).toBe("opex:latest")
        expect(app.ports).toEqual(["3000:3000"])
        expect(app.environment).toEqual(["NODE_ENV"])
        expect(app.dependsOn).toEqual(["db"])
        expect(summary.volumes).toEqual(["data"])
    })

    it("findComposeIsolationConflicts aponta container_name e volume external", () => {
        const conflicts = findComposeIsolationConflicts(compose)
        expect(conflicts).toHaveLength(2)
        expect(conflicts.join(" ")).toContain("container_name")
        expect(conflicts.join(" ")).toContain("volume")
    })

    it("compose sem conflitos devolve lista vazia", () => {
        expect(findComposeIsolationConflicts({ services: { app: { image: "x" } } })).toEqual([])
    })
})
