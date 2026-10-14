import { describe, expect, it } from "vitest"
import { groupComposeProjects, parseDockerPsLabels, DOCKER_PS_SEPARATOR } from "@/features/environments/parsers"
import { pickComposeProject } from "@/features/environments/logic"
import { buildEnvironmentStatus } from "@/features/environments/server/containers"

const line = (fields: string[]) => fields.join(DOCKER_PS_SEPARATOR)

const APP = line([
    "abc123",
    "meuprojeto-app-1",
    "meuprojeto:latest",
    "running",
    "Up 2 hours (healthy)",
    "meuprojeto",
    "/home/deploy/apps/meuprojeto",
    "/home/deploy/apps/meuprojeto/docker-compose.yml",
    "app",
])
const DB = line([
    "def456",
    "meuprojeto-db-1",
    "mongo:7",
    "exited",
    "Exited (0) 3 minutes ago",
    "meuprojeto",
    "/home/deploy/apps/meuprojeto",
    "/home/deploy/apps/meuprojeto/docker-compose.yml",
    "db",
])
const OUTRO = line([
    "ghi789",
    "outro-app-1",
    "outro:1",
    "running",
    "Up 1 hour",
    "outro",
    "/srv/outro",
    "/srv/outro/compose.yaml",
    "app",
])

describe("parsers — docker ps com labels de projeto", () => {
    it("lê a identidade do projeto Compose de cada container", () => {
        const containers = parseDockerPsLabels([APP, DB].join("\n"))
        expect(containers).toHaveLength(2)
        expect(containers[0]).toMatchObject({ name: "meuprojeto-app-1", project: "meuprojeto", service: "app", workingDir: "/home/deploy/apps/meuprojeto" })
        expect(containers[1]).toMatchObject({ state: "exited", service: "db" })
    })

    it("ignora linhas vazias e incompletas", () => {
        expect(parseDockerPsLabels("\n\nlixo-sem-tab\n")).toEqual([])
    })

    it("agrupa por projeto com diretório, arquivos, serviços e se está rodando", () => {
        const groups = groupComposeProjects(parseDockerPsLabels([APP, DB, OUTRO].join("\n")))
        const meu = groups.find((group) => group.project === "meuprojeto")
        expect(meu).toMatchObject({ workingDir: "/home/deploy/apps/meuprojeto", running: true })
        expect(meu!.services.sort()).toEqual(["app", "db"])
        expect(meu!.configFiles).toEqual(["/home/deploy/apps/meuprojeto/docker-compose.yml"])
    })
})

describe("logic — adoção do projeto Compose existente", () => {
    const candidates = groupComposeProjects(parseDockerPsLabels([APP, DB, OUTRO].join("\n")))

    it("adota o único projeto que casa diretório e arquivo do compose", () => {
        const result = pickComposeProject(candidates, { directory: "/home/deploy/apps/meuprojeto/", composeFile: "docker-compose.yml" })
        expect(result.project?.project).toBe("meuprojeto")
        expect(result.ambiguous).toBe(false)
    })

    it("não adota quando o diretório não corresponde", () => {
        const result = pickComposeProject(candidates, { directory: "/home/deploy/apps/outro-app", composeFile: "docker-compose.yml" })
        expect(result.project).toBeNull()
        expect(result.ambiguous).toBe(false)
    })

    it("pede escolha explícita com mais de um candidato no mesmo diretório", () => {
        const dois = [
            ...candidates,
            { project: "meuprojeto-2", workingDir: "/home/deploy/apps/meuprojeto", configFiles: ["/home/deploy/apps/meuprojeto/docker-compose.yml"], services: ["app"], running: true },
        ]
        const result = pickComposeProject(dois, { directory: "/home/deploy/apps/meuprojeto", composeFile: "docker-compose.yml" })
        expect(result.project).toBeNull()
        expect(result.ambiguous).toBe(true)
    })

    it("ignora projeto cujo arquivo do compose é outro", () => {
        const result = pickComposeProject(candidates, { directory: "/srv/outro", composeFile: "docker-compose.yml" })
        expect(result.project).toBeNull()
    })
})

describe("containers — status do ambiente", () => {
    const containers = parseDockerPsLabels([APP, DB].join("\n"))

    it("marca parcial quando há container rodando e outro parado", () => {
        const status = buildEnvironmentStatus(containers, { containers, reachable: true, error: null })
        expect(status.running).toBe(true)
        expect(status.partial).toBe(true)
        expect(status.reachable).toBe(true)
        expect(status.containers).toHaveLength(2)
    })

    it("host indisponível nunca vira 'Parado' silencioso", () => {
        const status = buildEnvironmentStatus([], { containers: [], reachable: false, error: "SSH fora do ar" })
        expect(status.running).toBe(false)
        expect(status.reachable).toBe(false)
        expect(status.error).toBe("SSH fora do ar")
        expect(status.checkedAt).toBeNull()
    })

    it("só rodando não é parcial", () => {
        const status = buildEnvironmentStatus([parseDockerPsLabels(APP)[0]!], { containers: [], reachable: true, error: null })
        expect(status.running).toBe(true)
        expect(status.partial).toBe(false)
    })
})
