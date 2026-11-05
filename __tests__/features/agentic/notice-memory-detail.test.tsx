/** @vitest-environment happy-dom */

import React from "react"
import { AxiosError, type AxiosResponse } from "axios"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/lib/api", async (original) => {
    const actual = await original<typeof import("@/lib/api")>()
    return { ...actual, api: { get: mocks.get } }
})

import { NoticeMemoryDetail } from "@/features/agentic/components/workbench/NoticeMemoryDetail"
import type { WorkbenchNoticeMemoryRef } from "@/features/agentic/types"

/** OPE-139: painel do aviso de memória na Saída da IA — lê a memória do Engramind só ao abrir. */

const C = "a".repeat(24)
const META = { textMin: 3, textMax: 4000, categories: [{ key: "PROJECT_RULES", label: "Regras do projeto" }], migrationPending: false, availability: null, outside: null, error: null }
const MEMORY = { id: "m_1", texto: "Sempre rode só os testes afetados, nunca a suíte inteira.", resumo: "Rodar só os testes afetados", resumoPendente: false, categoria: "PROJECT_RULES", fixada: false, ativa: true, versao: 1, autor: null, doDono: false, criadaEm: "", atualizadaEm: "" }
const ok = (data: unknown) => ({ data: { success: true, data } })
const gone = (code: string) => new AxiosError("404", "ERR_BAD_REQUEST", undefined, undefined, { status: 404, data: { success: false, error: "Não encontrada", code } } as AxiosResponse)

let routes: Record<string, () => unknown>
beforeEach(() => {
    routes = { "/ai/memories/meta": () => ok(META) }
    mocks.get.mockReset()
    mocks.get.mockImplementation(async (path: string) => {
        const route = routes[path]
        if (!route) throw new Error(`rota inesperada ${path}`)
        return route()
    })
})
afterEach(cleanup)

function renderNotice(memories: WorkbenchNoticeMemoryRef[]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <NoticeMemoryDetail message="Memória gravada pelo agente: Sempre rode" memories={memories} />
        </QueryClientProvider>,
    )
}
const open = () => fireEvent.click(screen.getByRole("button", { name: /ver detalhes/ }))
const panel = () => screen.getByTestId("memory-detail-panel")
const memoryCalls = () => mocks.get.mock.calls.map((call) => call[0] as string).filter((path) => path !== "/ai/memories/meta")

describe("NoticeMemoryDetail", () => {
    it("nada é lido antes de abrir; ao abrir mostra título, canal, categoria e conteúdo completo da memória", async () => {
        routes[`/agentic/centrals/${C}/memories/m_1`] = () => ok(MEMORY)
        renderNotice([{ kind: "memory", agentId: "developer-central", memoryId: "m_1", centralId: C, action: "created" }])
        expect(memoryCalls()).toEqual([])
        open()
        await waitFor(() => expect(within(panel()).getByText("Rodar só os testes afetados")).toBeTruthy())
        const text = panel().textContent ?? ""
        expect(text).toContain("Memórias da central")
        expect(text).toContain(`agentes/desenvolvedor/central/${C}`)
        await waitFor(() => expect(panel().textContent).toContain("Regras do projeto"))
        expect(within(panel()).getByLabelText("Texto completo da memória").textContent).toBe(MEMORY.texto)
        expect(text).toContain("Memória nova")
        expect(memoryCalls()).toEqual([`/agentic/centrals/${C}/memories/m_1`])
    })

    it("memória que não existe mais (404): estado de excluída, sem nova tentativa", async () => {
        routes["/ai/agents/developer-global/memories/m_9"] = () => {
            throw gone("NOT_FOUND")
        }
        renderNotice([{ kind: "memory", agentId: "developer-global", memoryId: "m_9", action: "updated" }])
        open()
        await waitFor(() => expect(panel().textContent).toContain("não está mais no Engramind"))
        expect(memoryCalls()).toHaveLength(1)
    })

    it("aviso de exclusão: não lê nada e mostra a memória como excluída", async () => {
        renderNotice([{ kind: "memory", agentId: "developer-global", memoryId: "m_9", action: "deleted" }])
        open()
        expect(panel().textContent).toContain("Memória excluída")
        expect(memoryCalls()).toEqual([])
    })

    it("falha ao ler: mensagem e Tentar novamente relê", { timeout: 15000 }, async () => {
        let fail = true
        routes["/ai/agents/adversarial/memories/m_1"] = () => {
            if (fail) throw new Error("Engramind fora do ar")
            return ok(MEMORY)
        }
        renderNotice([{ kind: "memory", agentId: "adversarial", memoryId: "m_1", action: "created" }])
        open()
        // Falha transitória: o hook tenta de novo antes de mostrar o erro.
        await waitFor(() => expect(panel().textContent).toContain("Não foi possível carregar a memória."), { timeout: 6000 })
        fail = false
        fireEvent.click(within(panel()).getByRole("button", { name: /Tentar novamente/ }))
        await waitFor(() => expect(within(panel()).getByText("Rodar só os testes afetados")).toBeTruthy())
    })

    it("sugestão do Mentor: lê a execução e mostra a proposta como ainda não gravada", async () => {
        const runId = "f".repeat(24)
        routes[`/adversarial/mentor/runs/${runId}`] = () => ok({ id: runId, status: "suggested", proposal: { action: "create", memoryId: null, text: "Proposta do Mentor.", target: "developer-global", centralId: null }, extraProposal: null, memoryId: null, extraMemoryId: null })
        renderNotice([{ kind: "suggestion", mentorRunId: runId, part: "main" }])
        open()
        await waitFor(() => expect(panel().textContent).toContain("Proposta do Mentor."))
        expect(panel().textContent).toContain("Sugestão, ainda não gravada")
        expect(panel().textContent).toContain("Memórias globais do agente desenvolvedor")
        expect(panel().textContent).toContain("Definida ao gravar")
    })

    it("duas memórias (lição dividida): abas Principal e Parte separada", async () => {
        routes["/ai/agents/developer-global/memories/m_1"] = () => ok(MEMORY)
        routes[`/agentic/centrals/${C}/memories/m_2`] = () => ok({ ...MEMORY, id: "m_2", resumo: "Parte da central", texto: "Texto da central." })
        renderNotice([
            { kind: "memory", agentId: "developer-global", memoryId: "m_1", action: "created" },
            { kind: "memory", agentId: "developer-central", memoryId: "m_2", centralId: C, action: "created" },
        ])
        open()
        await waitFor(() => expect(within(panel()).getByText("Rodar só os testes afetados")).toBeTruthy())
        fireEvent.click(within(panel()).getByRole("radio", { name: "Parte separada" }))
        await waitFor(() => expect(within(panel()).getByText("Parte da central")).toBeTruthy())
    })
})
