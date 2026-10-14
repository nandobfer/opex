import { describe, expect, it } from "vitest"
import { buildComposeOverride, composeCommand, inferContainerPort } from "@/features/environments/server/docker"
import { summarizeCompose } from "@/features/environments/logic"

describe("docker — comandos", () => {
    it("composeCommand inclui o projeto e os arquivos base + override", () => {
        const command = composeCommand({ projectName: "repo-amb", composeFile: "docker-compose.yml", overrideFile: "/dir/.opex/repo-amb.override.yml" })
        expect(command).toContain("-p 'repo-amb'")
        expect(command).toContain("-f 'docker-compose.yml'")
        expect(command).toContain("-f '/dir/.opex/repo-amb.override.yml'")
        expect(command.startsWith("docker compose ")).toBe(true)
    })

    it("composeCommand sem override usa só o arquivo base", () => {
        expect(composeCommand({ projectName: "p", composeFile: "compose.yml" })).toBe("docker compose -p 'p' -f 'compose.yml'")
    })
})

describe("docker — porta do container", () => {
    const summary = summarizeCompose({ services: { app: { ports: ["8080:3000"] }, worker: { ports: ["9000"] }, none: {} } })

    it("infere a porta do container a partir do mapeamento", () => {
        expect(inferContainerPort(summary, "app")).toBe(3000)
        expect(inferContainerPort(summary, "worker")).toBe(9000)
    })

    it("usa o primeiro serviço quando não há serviço informado", () => {
        expect(inferContainerPort(summary, null)).toBe(3000)
    })

    it("devolve null sem portas", () => {
        expect(inferContainerPort(summary, "none")).toBeNull()
    })
})

describe("docker — override do compose", () => {
    it("monta imagem, porta e limites", () => {
        const yaml = buildComposeOverride({
            service: "app",
            image: "opex:2026.10-20260101000000",
            publishedPort: 4001,
            containerPort: 3000,
            cpus: 2,
            memoryMb: 2048,
        })
        expect(yaml).toContain("image: opex:2026.10-20260101000000")
        expect(yaml).toContain("4001:3000")
        expect(yaml).toContain('cpus: "2"')
        expect(yaml).toContain("memory: 2048M")
    })

    it("não injeta variáveis: o .env real do host é a fonte", () => {
        const yaml = buildComposeOverride({ service: "app", image: "opex:1" })
        expect(yaml).not.toContain("environment")
    })

    it("sem porta do container não publica portas", () => {
        const yaml = buildComposeOverride({ service: "app", publishedPort: 4001, containerPort: null })
        expect(yaml).not.toContain("ports")
    })
})
