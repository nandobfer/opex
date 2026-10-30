import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Fachada dos recursos com o host simulado num $HOME temporário: os comandos de shell (find, mv, tar)
 * rodam de verdade; a API do OpenCode, o npm/GitHub, a auditoria e o Pusher são mockados.
 */

const state = vi.hoisted(() => ({ home: "", client: null as unknown, fake: null as null | ((command: string) => { exitCode: number; output: string } | undefined) }))
const mocks = vi.hoisted(() => ({ recordAudit: vi.fn(), publish: vi.fn(), npmAvailable: vi.fn(), configGet: vi.fn(), pluginUpdate: vi.fn() }))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", EXECUTAR: "EXECUTAR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/ai/catalog", () => ({ clearAiCatalogCache: vi.fn() }))
vi.mock("@/features/opencode-resources/server/versions", () => ({ npmAvailable: mocks.npmAvailable, githubFolderHash: vi.fn(async () => null), clearVersionCache: vi.fn(), fetchNpmPackage: vi.fn() }))
vi.mock("@/features/opencode-resources/server/scopes", () => ({
    GLOBAL_SCOPE_DTO: { id: "global", label: "Global (usuário)", directory: null },
    listScopes: vi.fn(async () => [{ id: "global", label: "Global (usuário)", directory: null }]),
    resolveScope: vi.fn(async () => ({ id: "global", label: "Global (usuário)", directory: null })),
}))
vi.mock("@/features/opencode-resources/server/host", async (importActual) => {
    const actual = await importActual<typeof import("@/features/opencode-resources/server/host")>()
    return {
        ...actual,
        openHost: vi.fn(async () => ({
            client: state.client,
            home: state.home,
            defaultDirectory: undefined,
            run: async (command: string) => {
                const faked = state.fake?.(command)
                if (faked) return faked
                try {
                    return { exitCode: 0, output: execSync(command, { shell: "/bin/bash", encoding: "utf8", env: { ...process.env, HOME: state.home } }) }
                } catch (error) {
                    const failure = error as { status?: number; stdout?: string; stderr?: string }
                    return { exitCode: failure.status ?? 1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` }
                }
            },
            readText: async (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null),
            writeText: async (file: string, text: string) => {
                fs.mkdirSync(path.dirname(file), { recursive: true })
                fs.writeFileSync(file, text)
            },
        })),
    }
})

import { createResource, deleteResource, getResource, installResource, listResources, setResourceEnabled, testMcpById, updateResource, updateResources } from "@/features/opencode-resources/server/service"
import { listBackups, restoreBackup } from "@/features/opencode-resources/server/backups"
import { encodeResourceId } from "@/features/opencode-resources/ids"

const ui = { id: "local", origin: "ui" as const }
const configFile = () => path.join(state.home, ".config/opencode/opencode.jsonc")
const backupIndex = () => JSON.parse(fs.readFileSync(path.join(state.home, ".local/share/opencode/opex-backups/index.json"), "utf8")) as { backups: { action: string; absent: string[] }[] }

beforeEach(() => {
    vi.clearAllMocks()
    state.home = fs.mkdtempSync(path.join(os.tmpdir(), "opex-oc-"))
    fs.mkdirSync(path.dirname(configFile()), { recursive: true })
    fs.writeFileSync(configFile(), `{\n  // do dono\n  "$schema": "https://opencode.ai/config.json"\n}\n`)
    state.fake = null
    mocks.configGet.mockResolvedValue([])
    mocks.npmAvailable.mockResolvedValue(null)
    state.client = {
        skill: { list: async () => ({ data: [] }) },
        agent: { list: async () => ({ data: [] }) },
        command: { list: async () => ({ data: [] }) },
        plugin: { list: async () => ({ data: [] }), check: async () => ({ data: [] }), update: mocks.pluginUpdate },
        mcp: { list: async () => ({ data: [] }), connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined) },
        config: { get: mocks.configGet },
        location: { reload: vi.fn(async () => undefined) },
    }
})
afterEach(() => fs.rmSync(state.home, { recursive: true, force: true }))

describe("recursos do OpenCode — fachada", () => {
    it("cria a skill com backup ANTES (o diretório novo fica como 'ausente'), audita e avisa a tela", async () => {
        const result = await createResource({ kind: "skill", scope: "global", name: "minha", frontmatter: { description: "Use quando…" }, body: "faça" }, ui)
        const file = path.join(state.home, ".agents/skills/minha/SKILL.md")
        expect(fs.readFileSync(file, "utf8")).toBe("---\nname: minha\ndescription: Use quando…\n---\n\nfaça\n")
        expect(result.backupId).toBeTruthy()
        expect(backupIndex().backups[0]).toMatchObject({ action: "criar", absent: [path.join(state.home, ".agents/skills/minha")] })
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "RecursoOpenCode", acao: "CRIAR", depois: expect.objectContaining({ origem: "ui", nome: "minha" }) }))
        expect(mocks.publish).toHaveBeenCalledWith("opencode-resources-updated", { kind: "skill", scope: "global" })
    })

    it("frontmatter inválido é recusado antes de gravar", async () => {
        await expect(createResource({ kind: "skill", scope: "global", name: "x", frontmatter: { name: "outro", description: "d" }, body: "b" }, ui)).rejects.toMatchObject({ status: 400 })
        await expect(createResource({ kind: "command", scope: "global", name: "c", frontmatter: {}, body: "  " }, ui)).rejects.toMatchObject({ status: 400 })
        expect(fs.existsSync(path.join(state.home, ".agents/skills/x"))).toBe(false)
    })

    it("desliga e liga sem remover (pasta guardada + manifesto)", async () => {
        await createResource({ kind: "agent", scope: "global", name: "rev", frontmatter: { description: "Revisa", mode: "subagent" }, body: "Você revisa." }, ui)
        const id = encodeResourceId({ kind: "agent", scope: "global", name: "rev" })
        await setResourceEnabled(id, false, ui)
        expect(fs.existsSync(path.join(state.home, ".config/opencode/agents/rev.md"))).toBe(false)
        expect((await listResources("agent", "global")).find((item) => item.name === "rev")).toMatchObject({ enabled: false })
        await setResourceEnabled(id, true, ui)
        expect(fs.existsSync(path.join(state.home, ".config/opencode/agents/rev.md"))).toBe(true)
        expect((await listResources("agent", "global")).find((item) => item.name === "rev")).toMatchObject({ enabled: true, tags: ["subagent"] })
    })

    it("valores dos segredos do MCP ficam só no arquivo: nem lista, nem detalhe, nem auditoria", async () => {
        await createResource({ kind: "mcp", scope: "global", name: "db", mcp: { type: "local", command: ["db-mcp"] }, secrets: { environment: [{ key: "SENHA", value: "s3gr3do" }] } }, ui)
        expect(fs.readFileSync(configFile(), "utf8")).toContain("s3gr3do")
        expect(fs.readFileSync(configFile(), "utf8")).toContain("// do dono")
        const list = await listResources("mcp", "global")
        const detail = await getResource(list[0]!.id)
        expect(detail.mcp?.environmentKeys).toEqual(["SENHA"])
        expect(JSON.stringify([list, detail, mocks.recordAudit.mock.calls, mocks.publish.mock.calls])).not.toContain("s3gr3do")
    })

    it("configuração recusada pelo OpenCode é desfeita pelo backup", async () => {
        mocks.configGet.mockRejectedValueOnce(Object.assign(new Error("chave desconhecida"), { _tag: "InvalidRequestError" }))
        const before = fs.readFileSync(configFile(), "utf8")
        await expect(createResource({ kind: "mcp", scope: "global", name: "x", mcp: { type: "remote", url: "https://x.dev/mcp" } }, ui)).rejects.toMatchObject({ status: 422, code: "OPENCODE_CONFIG_REJECTED" })
        expect(fs.readFileSync(configFile(), "utf8")).toBe(before)
    })

    it("alterações simultâneas são serializadas (nenhum backup se perde no índice)", async () => {
        await Promise.all([
            createResource({ kind: "mcp", scope: "global", name: "a", mcp: { type: "remote", url: "https://a.dev/mcp" } }, ui),
            createResource({ kind: "mcp", scope: "global", name: "b", mcp: { type: "remote", url: "https://b.dev/mcp" } }, ui),
        ])
        expect(backupIndex().backups).toHaveLength(2)
        expect((await listResources("mcp", "global")).map((item) => item.name).sort()).toEqual(["a", "b"])
    })

    it("plugin: instalar e desinstalar pedem reinício; atualizar usa plugin.update", async () => {
        const installed = await installResource({ kind: "plugin", scope: "global", source: "meu-plugin@latest" }, ui)
        expect(installed.restartRequired).toBe(true)
        mocks.npmAvailable.mockResolvedValue("2.0.0")
        state.client = { ...(state.client as object), plugin: { list: async () => ({ data: [] }), check: async () => ({ data: [{ id: "p", source: { type: "package", target: "meu-plugin@latest", version: "1.0.0" }, features: {}, state: { status: "active" } }] }), update: mocks.pluginUpdate } }
        const result = await updateResources("plugin", "global", { all: true }, ui)
        expect(result.updated.map((item) => item.name)).toEqual(["meu-plugin@latest"])
        expect(mocks.pluginUpdate).toHaveBeenCalledWith(expect.objectContaining({ targets: ["meu-plugin@latest"] }))
        const removed = await deleteResource(encodeResourceId({ kind: "plugin", scope: "global", name: "meu-plugin@latest" }), ui)
        expect(removed.restartRequired).toBe(true)
        expect(fs.readFileSync(configFile(), "utf8")).toContain('"plugins": []')
    })

    it("MCP de pacote: instala com a versão fixada e atualiza todos os desatualizados", async () => {
        mocks.npmAvailable.mockResolvedValueOnce("1.0.0")
        await installResource({ kind: "mcp", scope: "global", source: "@org/server-x" }, ui)
        expect(fs.readFileSync(configFile(), "utf8")).toContain("@org/server-x@1.0.0")
        mocks.npmAvailable.mockResolvedValue("1.2.0")
        await updateResources("mcp", "global", { all: true }, ui)
        expect(fs.readFileSync(configFile(), "utf8")).toContain("@org/server-x@1.2.0")
    })

    it("nativos são só leitura e id de outro tipo é recusado", async () => {
        state.client = { ...(state.client as object), command: { list: async () => ({ data: [{ name: "init", description: "x" }] }) } }
        const list = await listResources("command", "global")
        expect(list[0]).toMatchObject({ name: "init", builtin: true, editable: false })
        await expect(deleteResource(list[0]!.id, ui)).rejects.toMatchObject({ status: 409 })
        await expect(getResource("lixo")).rejects.toMatchObject({ status: 400 })
    })

    it("editar um MCP mantém o timeout configurado e os segredos (F1)", async () => {
        fs.writeFileSync(configFile(), `{\n  "mcp": { "servers": { "r": { "type": "remote", "url": "https://a.dev/mcp", "timeout": { "startup": 60000 }, "headers": { "Authorization": "Bearer x" }, "disabled": false } } }\n}\n`)
        const id = encodeResourceId({ kind: "mcp", scope: "global", name: "r" })
        await updateResource(id, { mcp: { type: "remote", url: "https://b.dev/mcp" }, secrets: { headers: [{ key: "Authorization" }] } }, ui)
        const saved = JSON.parse(fs.readFileSync(configFile(), "utf8")).mcp.servers.r
        expect(saved).toMatchObject({ url: "https://b.dev/mcp", timeout: { startup: 60000 }, headers: { Authorization: "Bearer x" } })
        expect((await getResource(id)).mcp?.timeout).toEqual({ startup: 60000 })
    })

    it("atualizar todos ignora itens desligados e só informa o que foi tratado (F8)", async () => {
        mocks.npmAvailable.mockResolvedValue("1.2.0")
        fs.writeFileSync(
            configFile(),
            `{ "mcp": { "servers": { "on": { "type": "local", "command": ["npx", "-y", "pkg-on@1.0.0"], "disabled": false }, "off": { "type": "local", "command": ["npx", "-y", "pkg-off@1.0.0"], "disabled": true } } } }\n`,
        )
        const result = await updateResources("mcp", "global", { all: true }, ui)
        expect(result.updated.map((item) => item.name)).toEqual(["on"])
        const text = fs.readFileSync(configFile(), "utf8")
        expect(text).toContain("pkg-on@1.2.0")
        expect(text).toContain("pkg-off@1.0.0")
        // Pedido individual de um desligado: nada tratado, nada informado como atualizado.
        const off = await updateResources("mcp", "global", { ids: [encodeResourceId({ kind: "mcp", scope: "global", name: "off" })] }, ui)
        expect(off.updated).toEqual([])
    })

    it("skill de repositório: instala pela CLI, aparece com a origem e excluir limpa o lock", async () => {
        const skillDir = path.join(state.home, ".agents/skills/repo-skill")
        const lockFile = path.join(state.home, ".agents/.skill-lock.json")
        state.fake = (command) => {
            if (!command.includes("npx -y skills add")) return undefined
            expect(command).toContain("'dono/repo' -s 'repo-skill' -g -y")
            fs.mkdirSync(skillDir, { recursive: true })
            fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: repo-skill\ndescription: Do repo\n---\n\nx\n")
            fs.writeFileSync(lockFile, JSON.stringify({ version: 3, skills: { "repo-skill": { source: "dono/repo", skillPath: "skills/repo-skill/SKILL.md", skillFolderHash: "abc1234" } } }))
            return { exitCode: 0, output: "ok" }
        }
        const installed = await installResource({ kind: "skill", scope: "global", source: "dono/repo", skills: ["repo-skill"] }, ui)
        expect(installed.names).toEqual(["repo-skill"])
        const item = (await listResources("skill", "global")).find((entry) => entry.name === "repo-skill")
        expect(item).toMatchObject({ origin: "package", source: "dono/repo", version: { installed: "abc1234" } })
        await deleteResource(item!.id, ui)
        expect(fs.existsSync(skillDir)).toBe(false)
        expect(JSON.parse(fs.readFileSync(lockFile, "utf8")).skills).toEqual({})
    })

    it("agente e comando no JSON: editar, desligar e religar preservam a entrada", async () => {
        fs.writeFileSync(configFile(), `{\n  // do dono\n  "agents": { "rev": { "description": "Revisa", "mode": "subagent" } },\n  "commands": { "dep": { "template": "Faça o deploy" } }\n}\n`)
        const agentId = encodeResourceId({ kind: "agent", scope: "global", name: "rev" })
        expect((await getResource(agentId)).config).toEqual({ description: "Revisa", mode: "subagent" })
        await updateResource(agentId, { config: { description: "Revisa tudo", mode: "subagent" } }, ui)
        await expect(updateResource(encodeResourceId({ kind: "command", scope: "global", name: "dep" }), { config: { description: "sem template" } }, ui)).rejects.toMatchObject({ status: 400 })
        await setResourceEnabled(agentId, false, ui)
        expect(JSON.parse(fs.readFileSync(configFile(), "utf8").replace(/\/\/.*\n/, "")).agents).toEqual({})
        expect((await listResources("agent", "global")).find((item) => item.name === "rev")).toMatchObject({ enabled: false })
        await setResourceEnabled(agentId, true, ui)
        const text = fs.readFileSync(configFile(), "utf8")
        expect(text).toContain("// do dono")
        expect(JSON.parse(text.replace(/\/\/.*\n/, "")).agents.rev).toEqual({ description: "Revisa tudo", mode: "subagent" })
    })

    it("restaurar backup volta o arquivo e guarda antes o estado atual", async () => {
        const before = fs.readFileSync(configFile(), "utf8")
        await createResource({ kind: "mcp", scope: "global", name: "a", mcp: { type: "remote", url: "https://a.dev/mcp" } }, ui)
        const [backup] = await listBackups()
        expect(backup).toMatchObject({ action: "criar" })
        const result = await restoreBackup(backup!.id, ui)
        expect(fs.readFileSync(configFile(), "utf8")).toBe(before)
        expect(result.safetyBackupId).not.toBe(backup!.id)
        expect((await listBackups()).map((item) => item.action)).toEqual(["restaurar", "criar"])
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "BackupOpenCode" }))
        await expect(restoreBackup("nao-existe", ui)).rejects.toMatchObject({ status: 404 })
    })

    it("testar MCP reconecta e lista as ferramentas; o arquivo temporário não fica no host", async () => {
        await createResource({ kind: "mcp", scope: "global", name: "t", mcp: { type: "local", command: ["srv"] }, secrets: { environment: [{ key: "K", value: "v" }] } }, ui)
        let configPath = ""
        state.fake = (command) => {
            if (!command.includes("@modelcontextprotocol/inspector")) return undefined
            configPath = /--config '([^']+)'/.exec(command)![1]!
            expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({ mcpServers: { t: { command: "srv", args: [], env: { K: "v" } } } })
            fs.rmSync(configPath)
            return { exitCode: 0, output: 'OPEX_TOOLS [{"n":"echo","d":"Ecoa"}]' }
        }
        state.client = { ...(state.client as object), mcp: { list: async () => ({ data: [{ name: "t", status: { status: "connected" } }] }), connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined) } }
        const result = await testMcpById(encodeResourceId({ kind: "mcp", scope: "global", name: "t" }))
        expect(result).toMatchObject({ status: "connected", tools: [{ name: "echo", description: "Ecoa" }], toolsError: null })
        expect(fs.existsSync(configPath)).toBe(false)
    })
})
