import { describe, expect, it } from "vitest"
import { addBackup, newBackupId, parseBackupIndex, type BackupMeta } from "@/features/opencode-resources/backups"
import { backupCommand, listMarkdownFilesCommand, mcpToolsCommand, moveCommand, parseMcpToolsOutput, quote, skillsAddCommand } from "@/features/opencode-resources/commands"
import { emptyManifest, findDisabled, parseManifest, serializeManifest, storedPathFor, withDisabled, withoutDisabled } from "@/features/opencode-resources/disabled-manifest"
import { FrontmatterError, parseMarkdownDocument, serializeMarkdownDocument } from "@/features/opencode-resources/frontmatter"
import { decodeResourceId, encodeResourceId } from "@/features/opencode-resources/ids"
import { ConfigFormatError, listMcpEntries, listPluginEntries, listSectionEntries, mcpStyle, parseConfigText, setMcpDisabled, setMcpEntry, setPluginEntries, setSectionEntry } from "@/features/opencode-resources/jsonc-edit"
import { applySecretPatches, buildMcpEntry, inspectorConfig, mcpDetailOf, withSecrets } from "@/features/opencode-resources/mcp-entry"
import { parseSkillLock, scopePaths, skillRepoFolder } from "@/features/opencode-resources/paths"
import { compareSemver, isNewer, latestStable, mcpCommandForSource, mcpNameFromSource, mcpPackageOf, parseNpmSpec, pinMcpPackage } from "@/features/opencode-resources/versions"

const V1 = `{
  // comentário do dono
  "mcp": {
    "mongodb": { "type": "local", "command": ["mongodb-mcp-server"], "environment": { "SENHA": "x" }, "enabled": true }
  },
  "plugin": ["a@latest"]
}
`

describe("jsonc-edit", () => {
    it("lê o formato 1.x normalizando enabled → disabled", () => {
        const config = parseConfigText(V1)
        expect(mcpStyle(config)).toBe("v1")
        expect(listMcpEntries(config)).toEqual([{ name: "mongodb", disabled: false, config: { type: "local", command: ["mongodb-mcp-server"], environment: { SENHA: "x" }, disabled: false } }])
        expect(listPluginEntries(config)).toEqual(["a@latest"])
    })

    it("grava no formato que o arquivo já usa e preserva os comentários", () => {
        const added = setMcpEntry(V1, "novo", { type: "remote", url: "https://x.dev/mcp", disabled: true })
        expect(added).toContain("// comentário do dono")
        const config = parseConfigText(added)
        expect((config.mcp as Record<string, unknown>).novo).toEqual({ type: "remote", url: "https://x.dev/mcp", enabled: false })
        const off = setMcpDisabled(added, "mongodb", true)
        expect(((parseConfigText(off).mcp as Record<string, Record<string, unknown>>).mongodb)!.enabled).toBe(false)
        const plugins = setPluginEntries(V1, ["a@latest", "b"])
        expect(parseConfigText(plugins).plugin).toEqual(["a@latest", "b"])
        expect(parseConfigText(plugins).plugins).toBeUndefined()
    })

    it("sem MCP grava no formato 2.x (mcp.servers + disabled)", () => {
        const text = setMcpEntry("", "x", { type: "local", command: ["echo"], disabled: false })
        expect(parseConfigText(text)).toEqual({ mcp: { servers: { x: { type: "local", command: ["echo"], disabled: false } } } })
        expect(listMcpEntries(parseConfigText(setMcpDisabled(text, "x", true)))[0]!.disabled).toBe(true)
        expect(listMcpEntries(parseConfigText(setMcpEntry(text, "x", undefined)))).toEqual([])
    })

    it("agentes/comandos do JSON respeitam agent/agents", () => {
        const text = setSectionEntry(`{ "agent": { "a": { "description": "x" } } }`, "agents", "b", { description: "y" })
        expect(Object.keys(listSectionEntries(parseConfigText(text), "agents"))).toEqual(["a", "b"])
        expect(parseConfigText(text).agents).toBeUndefined()
    })

    it("JSON inválido vira ConfigFormatError com linha", () => {
        expect(() => parseConfigText(`{\n  "a": ,\n}`)).toThrow(ConfigFormatError)
        expect(() => parseConfigText(`{\n  "a": ,\n}`)).toThrow(/linha 2/)
    })
})

describe("frontmatter", () => {
    it("separa frontmatter e corpo e monta de volta", () => {
        const doc = parseMarkdownDocument("---\nname: x\ndescription: Faz algo\n---\n\n# Corpo\n")
        expect(doc).toEqual({ frontmatter: { name: "x", description: "Faz algo" }, body: "\n# Corpo\n" })
        expect(serializeMarkdownDocument({ frontmatter: { name: "x", vazio: "" }, body: "oi" })).toBe("---\nname: x\n---\n\noi\n")
    })

    it("YAML inválido ou não-objeto lança FrontmatterError", () => {
        expect(() => parseMarkdownDocument("---\nname: [x\n---\nb")).toThrow(FrontmatterError)
        expect(() => parseMarkdownDocument("---\n- a\n---\nb")).toThrow(/objeto/)
    })

    it("sem frontmatter devolve o corpo inteiro", () => {
        expect(parseMarkdownDocument("só texto")).toEqual({ frontmatter: {}, body: "só texto" })
    })
})

describe("ids", () => {
    it("ida e volta; inválidos viram null", () => {
        const id = encodeResourceId({ kind: "plugin", scope: "global", name: "@a/b@latest" })
        expect(decodeResourceId(id)).toEqual({ kind: "plugin", scope: "global", name: "@a/b@latest" })
        expect(decodeResourceId("lixo")).toBeNull()
        expect(decodeResourceId(Buffer.from(JSON.stringify(["x", "global", "n"])).toString("base64url"))).toBeNull()
    })
})

describe("versions", () => {
    it("compara semver e escolhe a última estável (por major)", () => {
        expect(compareSemver("2.10.0", "2.9.9")).toBeGreaterThan(0)
        expect(compareSemver("2.0.0-next.1", "2.0.0")).toBeLessThan(0)
        expect(latestStable(["2.2.1", "2.2.2", "3.0.0", "0.0.0-dev-1"], 2)).toBe("2.2.2")
        expect(latestStable(["2.2.1", "3.0.0-beta.1"])).toBe("2.2.1")
        expect(isNewer("0.62.0", "0.58.2")).toBe(true)
        expect(isNewer(null, "1.0.0")).toBe(false)
    })

    it("especificadores npm e o pacote do MCP", () => {
        expect(parseNpmSpec("@scope/pkg@next")).toEqual({ name: "@scope/pkg", range: "next" })
        expect(parseNpmSpec("pkg")).toEqual({ name: "pkg", range: null })
        expect(parseNpmSpec("github:dono/repo")).toBeNull()
        expect(parseNpmSpec("dono/repo")).toBeNull()
        expect(mcpPackageOf(["npx", "-y", "@modelcontextprotocol/server-everything@2.1.0", "--x"])).toEqual({ index: 2, name: "@modelcontextprotocol/server-everything", range: "2.1.0" })
        expect(mcpPackageOf(["codegraph", "serve"])).toBeNull()
        expect(pinMcpPackage(["npx", "-y", "pkg@1.0.0"], "1.2.0")).toEqual(["npx", "-y", "pkg@1.2.0"])
        expect(mcpNameFromSource("@modelcontextprotocol/server-everything@2.1.0")).toBe("server-everything")
        expect(mcpNameFromSource("github:dono/Meu_MCP")).toBe("meu_mcp")
        expect(mcpCommandForSource("pkg", "3.0.0")).toEqual(["npx", "-y", "pkg@3.0.0"])
        expect(mcpCommandForSource("github:dono/repo", null)).toEqual(["npx", "-y", "github:dono/repo"])
    })
})

describe("manifesto de itens desligados", () => {
    it("acrescenta, encontra e remove; JSON inválido vira vazio", () => {
        const entry = { kind: "skill" as const, scope: "global", name: "x", originalPath: "/h/.agents/skills/x", storedPath: "/h/.config/opencode/.opex-disabled/global/skill/x", configPath: null, disabledAt: "2026-01-01T00:00:00.000Z" }
        const manifest = withDisabled(emptyManifest(), entry)
        expect(findDisabled(parseManifest(serializeManifest(manifest)), "skill", "global", "x")).toMatchObject({ storedPath: entry.storedPath })
        expect(withoutDisabled(manifest, "skill", "global", "x").entries).toEqual([])
        expect(parseManifest("{nao json")).toEqual(emptyManifest())
        expect(storedPathFor("/h", "central:abc", "agent", "/p/.opencode/agents/a.md")).toBe("/h/.config/opencode/.opex-disabled/central-abc/agent/a.md")
    })
})

describe("comandos no host", () => {
    it("todo valor variável vai entre aspas", () => {
        expect(quote("a'b")).toBe(`'a'\\''b'`)
        expect(listMarkdownFilesCommand(["/x/a b"])).toContain(`'/x/a b'`)
        expect(moveCommand("/a", "/b/c")).toContain("mkdir -p '/b'")
        expect(skillsAddCommand("dono/repo; rm -rf /", [], null)).toContain(`'dono/repo; rm -rf /'`)
        expect(skillsAddCommand("dono/repo", ["a"], "/proj")).toBe(`cd '/proj' && npx -y skills add 'dono/repo' -s 'a' -y`)
        expect(backupCommand("/h/b/1.tgz", ["/x"])).toContain("tar -czPf '/h/b/1.tgz'")
        expect(mcpToolsCommand("/h/.cache/t.json", "srv")).toContain("MCP_INSPECTOR_SECRET_STORE=memory")
    })

    it("lê a linha OPEX_TOOLS do inspector", () => {
        expect(parseMcpToolsOutput(`ruído\nOPEX_TOOLS [{"n":"echo","d":"Ecoa"},{"n":"x","d":""}]`)).toEqual([
            { name: "echo", description: "Ecoa" },
            { name: "x", description: null },
        ])
        expect(parseMcpToolsOutput("sem nada")).toBeNull()
    })
})

describe("caminhos por escopo e lock das skills", () => {
    it("global usa ~/.config/opencode e ~/.agents/skills; projeto usa o diretório", () => {
        expect(scopePaths("/home/u", "global", null)).toMatchObject({ configFiles: ["/home/u/.config/opencode/opencode.jsonc", "/home/u/.config/opencode/opencode.json"], newSkillRoot: "/home/u/.agents/skills" })
        expect(scopePaths("/home/u", "central:1", "/p/")).toMatchObject({ directory: "/p", newAgentDir: "/p/.opencode/agents", skillLockFile: "/p/skills-lock.json" })
    })

    it("lê o lock da CLI skills", () => {
        const lock = parseSkillLock(JSON.stringify({ version: 3, skills: { a: { source: "o/r", skillPath: "skills/a/SKILL.md", skillFolderHash: "abc" } } }))
        expect(lock.a).toEqual({ source: "o/r", sourceUrl: null, skillPath: "skills/a/SKILL.md", hash: "abc" })
        expect(skillRepoFolder("skills/a/SKILL.md")).toBe("skills/a")
        expect(skillRepoFolder("SKILL.md")).toBe("")
        expect(parseSkillLock("x")).toEqual({})
    })
})

describe("entradas de MCP e segredos", () => {
    it("replace: lista completa (sem valor mantém, fora da lista sai); merge: só a lista muda", () => {
        const existing = { A: "1", B: "2" }
        expect(applySecretPatches(existing, [{ key: "A" }, { key: "C", value: "3" }], "replace")).toEqual({ A: "1", C: "3" })
        expect(applySecretPatches(existing, [{ key: "B", value: null }, { key: "C", value: "3" }], "merge")).toEqual({ A: "1", C: "3" })
        expect(applySecretPatches(existing, undefined, "replace")).toEqual(existing)
    })

    it("monta a entrada preservando chaves extras do OpenCode; o DTO só tem os nomes", () => {
        const entry = buildMcpEntry({ type: "local", command: ["npx", "x"] }, { type: "local", command: ["old"], codemode: true, environment: { TOKEN: "s" } }, { environment: [{ key: "TOKEN" }] }, "replace")
        expect(entry).toEqual({ type: "local", command: ["npx", "x"], codemode: true, disabled: false, environment: { TOKEN: "s" } })
        const detail = mcpDetailOf(entry)
        expect(detail.environmentKeys).toEqual(["TOKEN"])
        expect(JSON.stringify(detail)).not.toContain('"s"')
        expect(withSecrets(entry, { environment: [{ key: "TOKEN", value: null }] }).environment).toBeUndefined()
        expect(inspectorConfig("x", entry)).toEqual({ mcpServers: { x: { command: "npx", args: ["x"], env: { TOKEN: "s" } } } })
    })
})

describe("índice dos backups", () => {
    const meta = (id: string, createdAt: string): BackupMeta => ({ id, createdAt, action: "editar", label: id, paths: [], absent: [], size: null })
    it("mantém os N mais recentes e devolve os descartados", () => {
        let index = parseBackupIndex(null)
        index = addBackup(index, meta("a", "2026-01-01"), 2).index
        index = addBackup(index, meta("b", "2026-01-02"), 2).index
        const result = addBackup(index, meta("c", "2026-01-03"), 2)
        expect(result.index.backups.map((item) => item.id)).toEqual(["c", "b"])
        expect(result.dropped).toEqual(["a"])
        expect(newBackupId(new Date("2026-10-30T01:02:03.456Z"), 0)).toBe("20261030T010203Z-0000")
    })
})
