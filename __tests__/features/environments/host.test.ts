import { describe, expect, it, vi } from "vitest"
vi.mock("@/features/environments/server/credentials", () => ({
    buildAccessFiles: async () => ({
        files: { "variables.json": { content: '{"TOKEN":"nao-expor-token"}', mode: 0o600 } },
        secretValues: ["nao-expor-token"],
    }),
}))
import {
    hostCommand,
    inspectHost,
    logsCommand,
    parseInspection,
    removeAccess,
    writeAccess,
    writeAccessCommand,
    type HostTarget,
} from "@/features/environments/server/host"
import { DEFAULT_ENVIRONMENT_SETTINGS } from "@/features/environments/schemas"
import type { OpencodeClient } from "@/lib/ai/opencode-client"

const settings = { ...DEFAULT_ENVIRONMENT_SETTINGS, enabled: true }
const scope = {
    environmentId: "e",
    projectId: "p",
    repoConfig: { mode: "local", host: "", port: 22, username: "", auth: "key", hostKey: "", workflow: "" },
    variables: [],
} as const
const ID = `sha256:${"a".repeat(64)}`

/** Cliente com `shell` em memória: cada comando devolve a saída/exit configurados. */
function fakeClient(reply: (command: string) => { output: string; exit: number }) {
    const commands: string[] = []
    let last = { output: "", exit: 0 }
    const client = {
        shell: {
            create: vi.fn(async ({ command }: { command: string }) => {
                commands.push(command)
                last = reply(command)
                return { data: { id: "sh", status: "exited", exit: last.exit } }
            }),
            get: vi.fn(async () => ({ data: { id: "sh", status: "exited", exit: last.exit } })),
            output: vi.fn(async () => ({ data: { output: last.output, cursor: 0, size: 0, truncated: false } })),
            remove: vi.fn(async () => undefined),
        },
    }
    return { client: client as unknown as OpencodeClient, commands, raw: client }
}

const target: HostTarget = { mode: "local", directory: "/srv/app", composeFile: "docker-compose.yml", project: "org-app-prod", accessDir: null }

const OUTPUT = [
    "@@CONFIG",
    JSON.stringify({
        services: {
            app: {
                image: "app:2",
                ports: [{ published: "3100", target: 3100, protocol: "tcp" }],
                volumes: [{ type: "bind", source: "/srv/data", target: "/data" }],
                environment: { PORT: "3100", SECRET: "nao-expor-token" },
            },
        },
    }),
    "@@PS",
    "app|c1|running|Up 2 minutes (healthy)",
    "@@IMAGES",
    `app|${ID}`,
    "@@META",
    `${ID}|2026-10-16T12:00:00.123456789Z|app:2`,
    "@@BUSY",
    "0",
    "@@END",
].join("\n")

describe("shell do OpenCode para o host", () => {
    it("grava o acesso pelo stdin (nunca nos argumentos) e confirma a gravação", async () => {
        const { client, commands } = fakeClient(() => ({ output: "OPEX_ACCESS_OK", exit: 0 }))
        const dir = "/tmp/opex-environments/operation-x"
        await expect(writeAccess(client, settings, scope, dir)).resolves.toEqual({ secretValues: ["nao-expor-token"] })
        expect(commands[0]).toMatch(/^umask 077 && printf '%s' '[A-Za-z0-9+/=]+' \| node -e /)
        expect(commands[0]).not.toContain("nao-expor-token")
        expect(commands[0].endsWith(`'${dir}'`)).toBe(true)
    })
    it("recusa gravar/remover fora do diretório de acesso e reporta falha de gravação", async () => {
        const { client } = fakeClient(() => ({ output: "", exit: 1 }))
        await expect(writeAccess(client, settings, scope, "/etc/passwd")).rejects.toMatchObject({ code: "ACCESS_WRITE_FAILED" })
        await expect(removeAccess(client, settings, "/tmp/opex-environments")).rejects.toMatchObject({ code: "ACCESS_WRITE_FAILED" })
        await expect(removeAccess(client, settings, "/tmp/opex-environments/../x")).rejects.toMatchObject({ code: "ACCESS_WRITE_FAILED" })
        await expect(writeAccess(client, settings, scope, "/tmp/opex-environments/operation-y")).rejects.toMatchObject({
            code: "ACCESS_WRITE_FAILED",
        })
    })
    it("OpenCode fora do ar vira HOST_UNREACHABLE", async () => {
        const client = { shell: { create: async () => Promise.reject(new Error("ECONNREFUSED")) } } as unknown as OpencodeClient
        await expect(inspectHost(client, settings, target)).rejects.toMatchObject({ code: "HOST_UNREACHABLE" })
    })
    it("lê o Compose efetivo só com nomes de variáveis, imagens por ID imutável e saúde", async () => {
        const result = parseInspection(OUTPUT, ["nao-expor-token"])
        expect(result.compose).toEqual([
            { service: "app", image: "app:2", ports: ["3100:3100"], volumes: ["/srv/data:/data"], variables: ["PORT", "SECRET"] },
        ])
        expect(JSON.stringify(result)).not.toContain("nao-expor-token")
        expect(result.images).toEqual([
            { service: "app", imageId: ID, tag: "app:2", version: "2", builtAt: "2026-10-16T12:00:00.123Z" },
        ])
        expect(result.containers).toEqual([{ service: "app", id: "c1", state: "running", health: "healthy" }])
        expect(result).toMatchObject({ healthy: true, quiescent: true })
        expect(parseInspection(OUTPUT.replace("@@BUSY\n0", "@@BUSY\n2")).quiescent).toBe(false)
    })
    it("mapeia saídas do host para códigos acionáveis", async () => {
        const missing = fakeClient(() => ({ output: "", exit: 3 }))
        await expect(inspectHost(missing.client, settings, target)).rejects.toMatchObject({ code: "COMPOSE_NOT_FOUND" })
        const broken = fakeClient(() => ({ output: "", exit: 5 }))
        await expect(inspectHost(broken.client, settings, target)).rejects.toMatchObject({ code: "HOST_COMMAND_FAILED" })
        const ok = fakeClient(() => ({ output: OUTPUT, exit: 0 }))
        await expect(inspectHost(ok.client, settings, target)).resolves.toMatchObject({ healthy: true })
        // Sempre em sh (o shell do usuário pode ser zsh, que não separa $args).
        expect(ok.commands[0]).toMatch(/^sh -c '/)
        expect(ok.commands[0]).toContain("/srv/app")
        expect(ok.commands[0]).toContain("label=com.docker.compose.project=org-app-prod")
    })
    it("no remoto, todo comando passa pelo helper SSH gravado no acesso", () => {
        const remote = { ...target, mode: "remote" as const, accessDir: "/tmp/opex-environments/logs-e" }
        expect(hostCommand(remote, "docker ps")).toMatch(/^node '\/tmp\/opex-environments\/logs-e\/ssh\.cjs' '/)
        expect(logsCommand(remote)).toContain("logs -f --no-color --timestamps --since=30s")
        expect(() => hostCommand({ ...remote, accessDir: null }, "x")).toThrow()
    })
    it("o pacote gravado é decodificável e preserva modos", () => {
        const command = writeAccessCommand("/tmp/opex-environments/operation-z", { a: { content: "b", mode: 0o600 } })
        const payload = /printf '%s' '([^']+)'/.exec(command)?.[1] ?? ""
        expect(JSON.parse(Buffer.from(payload, "base64").toString("utf8"))).toEqual({ a: { c: "b", m: 0o600 } })
    })
})
