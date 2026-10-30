/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { OpencodeResourceDetailDto, OpencodeResourceDto } from "@/features/opencode-resources/types"

const mocks = vi.hoisted(() => ({ detail: vi.fn(), update: vi.fn(), refetch: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/opencode-resources/hooks/useOpencodeResources", () => ({
    useOpencodeResource: mocks.detail,
    useCreateOpencodeResource: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateOpencodeResource: () => ({ mutate: mocks.update, isPending: false }),
}))

import { McpFormDialog } from "@/features/opencode-resources/components/McpFormDialog"
import { ResourceEditorDialog } from "@/features/opencode-resources/components/ResourceEditorDialog"

const row = (over: Partial<OpencodeResourceDto>): OpencodeResourceDto => ({
    id: "id1",
    kind: "mcp",
    name: "r",
    description: null,
    scope: "global",
    scopeLabel: "Global",
    origin: "config",
    source: null,
    path: null,
    enabled: true,
    builtin: false,
    editable: true,
    removable: true,
    version: null,
    tags: [],
    ...over,
})
const detail = (over: Partial<OpencodeResourceDetailDto>): OpencodeResourceDetailDto => ({ ...row({}), format: "mcp", frontmatter: null, body: null, config: null, mcp: null, files: [], ...over })
const query = (data: OpencodeResourceDetailDto | undefined, over: Record<string, unknown> = {}) => ({ data, isLoading: false, isFetching: false, isError: false, error: null, refetch: mocks.refetch, ...over })

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("editar MCP", () => {
    it("salva a edição preservando o comando com aspas e os segredos existentes", async () => {
        mocks.detail.mockReturnValue(query(detail({ mcp: { type: "local", command: ["node", "-e", 'console.log("oi")'], url: null, cwd: null, disabled: false, timeout: { startup: 60000 }, environmentKeys: ["TOKEN"], headerKeys: [] } })))
        render(<McpFormDialog scope="global" target={row({})} onClose={vi.fn()} />)
        const save = screen.getByRole("button", { name: "Salvar" })
        await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false))
        fireEvent.click(save)
        await waitFor(() =>
            expect(mocks.update).toHaveBeenCalledWith(
                { id: "id1", content: { mcp: { type: "local", command: ["node", "-e", 'console.log("oi")'], cwd: undefined, disabled: false }, secrets: { environment: [{ key: "TOKEN" }] } } },
                expect.anything(),
            ),
        )
    })

    it("falha ao carregar mostra o erro com Tentar novamente, nunca um formulário vazio (F4)", () => {
        mocks.detail.mockReturnValue(query(undefined, { isError: true, error: new Error("x") }))
        render(<McpFormDialog scope="global" target={row({})} onClose={vi.fn()} />)
        expect(screen.getByText("Não foi possível abrir o MCP")).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }))
        expect(mocks.refetch).toHaveBeenCalled()
    })

    it("enquanto busca o detalhe atual não mostra o formulário com dado velho (F3)", () => {
        mocks.detail.mockReturnValue(query(detail({ mcp: { type: "remote", url: "https://velho", command: null, cwd: null, disabled: false, timeout: null, environmentKeys: [], headerKeys: [] } }), { isFetching: true }))
        render(<McpFormDialog scope="global" target={row({})} onClose={vi.fn()} />)
        expect(screen.queryByDisplayValue("https://velho")).toBeNull()
    })
})

describe("editar skill/agente/comando", () => {
    const skill = row({ kind: "skill", name: "minha", origin: "file", path: "/h/.agents/skills/minha" })

    it("reabrir mostra o conteúdo atual depois da busca, não o do cache (F3)", () => {
        mocks.detail.mockReturnValue(query(detail({ kind: "skill", name: "minha", format: "markdown", frontmatter: { description: "A" }, body: "b" }), { isFetching: true }))
        const { rerender } = render(<ResourceEditorDialog kind="skill" scope="global" target={skill} onClose={vi.fn()} />)
        expect(screen.queryByDisplayValue("A")).toBeNull()
        mocks.detail.mockReturnValue(query(detail({ kind: "skill", name: "minha", format: "markdown", frontmatter: { description: "B" }, body: "b" })))
        rerender(<ResourceEditorDialog kind="skill" scope="global" target={skill} onClose={vi.fn()} />)
        expect(screen.getByDisplayValue("B")).toBeTruthy()
    })

    it("salva a edição preservando as chaves extras do frontmatter", async () => {
        mocks.detail.mockReturnValue(query(detail({ kind: "skill", name: "minha", format: "markdown", frontmatter: { description: "A", license: "MIT" }, body: "corpo" })))
        render(<ResourceEditorDialog kind="skill" scope="global" target={skill} onClose={vi.fn()} />)
        fireEvent.change(screen.getByLabelText("Descrição (quando usar)"), { target: { value: "Nova" } })
        const save = screen.getByRole("button", { name: "Salvar" })
        await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false))
        fireEvent.click(save)
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: "id1", content: { frontmatter: { license: "MIT", description: "Nova" }, body: "corpo" } }, expect.anything()))
    })
})
