import { describe, expect, it } from "vitest"
import { fromFrontmatter, jsonFormSchema, markdownFormSchema, mcpContentFromForm, mcpFormFromDetail, mcpFormSchema, toFrontmatter, type MarkdownFormValues } from "@/features/opencode-resources/form-schemas"
import { joinCommand, matchesStatus, outdatedCount, splitCommand } from "@/features/opencode-resources/logic"
import { withEnabled } from "@/features/opencode-resources/hooks/useOpencodeResources"
import type { OpencodeResourceDto } from "@/features/opencode-resources/types"

const base: MarkdownFormValues = { name: "minha", description: "", mode: "", model: "", agent: "", subtask: false, body: "" }

const item = (over: Partial<OpencodeResourceDto>): OpencodeResourceDto => ({
    id: "i",
    kind: "plugin",
    name: "p",
    description: null,
    scope: "global",
    scopeLabel: "Global",
    origin: "package",
    source: null,
    path: null,
    enabled: true,
    builtin: false,
    editable: false,
    removable: true,
    version: null,
    tags: [],
    ...over,
})

describe("formulários dos recursos (mesmas regras da API)", () => {
    it("skill exige descrição e instruções; nome inválido é recusado", () => {
        expect(markdownFormSchema("skill").safeParse(base).success).toBe(false)
        expect(markdownFormSchema("skill").safeParse({ ...base, description: "Use quando…", body: "faça" }).success).toBe(true)
        expect(markdownFormSchema("skill").safeParse({ ...base, name: "Com Espaço", description: "d", body: "b" }).success).toBe(false)
        expect(markdownFormSchema("command").safeParse(base).success).toBe(false)
        expect(markdownFormSchema("agent").safeParse(base).success).toBe(true)
    })

    it("frontmatter preserva chaves extras e tira campos vazios", () => {
        const { values, extras } = fromFrontmatter("agent", "rev", { description: "Revisa", mode: "subagent", permissions: { edit: "deny" }, name: "rev" }, "corpo")
        expect(values).toMatchObject({ name: "rev", description: "Revisa", mode: "subagent", body: "corpo" })
        expect(extras).toEqual({ permissions: { edit: "deny" } })
        expect(toFrontmatter("agent", { ...values, description: "", model: "x/y" }, extras)).toEqual({ permissions: { edit: "deny" }, mode: "subagent", model: "x/y" })
        expect(toFrontmatter("command", { ...base, subtask: true, agent: "build" }, {})).toEqual({ agent: "build", subtask: true })
    })

    it("JSON do config é validado pelo schema do tipo", () => {
        expect(jsonFormSchema("command").safeParse({ json: "{}" }).success).toBe(false)
        expect(jsonFormSchema("command").safeParse({ json: '{"template":"oi"}' }).success).toBe(true)
        expect(jsonFormSchema("agent").safeParse({ json: "[1]" }).success).toBe(false)
        expect(jsonFormSchema("agent").safeParse({ json: "{x" }).success).toBe(false)
    })

    it("MCP: comando com aspas, segredos vazios mantêm e novos exigem valor", () => {
        const form = mcpFormFromDetail("m", { type: "local", command: ["npx", "-y", "a b"], url: null, cwd: null, disabled: false, timeout: null, environmentKeys: ["TOKEN"], headerKeys: [] })
        expect(form.command).toBe('npx -y "a b"')
        expect(mcpFormSchema.safeParse(form).success).toBe(true)
        expect(mcpFormSchema.safeParse({ ...form, environment: [...form.environment, { key: "NOVO", value: "", existing: false }] }).success).toBe(false)
        expect(mcpContentFromForm({ ...form, environment: [...form.environment, { key: "NOVO", value: "v", existing: false }] })).toEqual({
            mcp: { type: "local", command: ["npx", "-y", "a b"], cwd: undefined, disabled: false },
            secrets: { environment: [{ key: "TOKEN" }, { key: "NOVO", value: "v" }] },
        })
        expect(mcpFormSchema.safeParse({ ...form, type: "remote", url: "nao-url" }).success).toBe(false)
    })
})

describe("lógica da tela", () => {
    it("divide e junta a linha de comando", () => {
        expect(splitCommand(`npx -y 'pacote x' "--a=b c"`)).toEqual(["npx", "-y", "pacote x", "--a=b c"])
        expect(splitCommand(`a ""`)).toEqual(["a", ""])
        expect(joinCommand(["npx", "a b"])).toBe('npx "a b"')
    })

    it("filtro de situação, contagem de atualizações e troca otimista", () => {
        const outdated = item({ id: "o", version: { installed: "1", available: "2", outdated: true } })
        const off = item({ id: "f", enabled: false })
        expect(matchesStatus(outdated, "outdated")).toBe(true)
        expect(matchesStatus(off, "enabled")).toBe(false)
        expect(outdatedCount([outdated, off, item({ id: "x", enabled: false, version: { installed: "1", available: "2", outdated: true } })])).toBe(1)
        expect(withEnabled([outdated, off], "f", true).map((row) => row.enabled)).toEqual([true, true])
    })
})
