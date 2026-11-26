// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ decisions: vi.fn(), params: [] as unknown[], refetch: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/secretary-agent/hooks/useSecretaryDecisions", () => ({
    useSecretaryDecisions: (params: unknown) => {
        mocks.params.push(params)
        return mocks.decisions()
    },
}))
vi.mock("@/features/evolution-api/components/EvolutionSyncAction", () => ({ EvolutionSyncAction: () => null }))
vi.mock("@/features/secretary-agent/components/criteria/DecisionModelCard", () => ({ DecisionModelCard: () => null }))

import { DecisionsTab } from "@/features/secretary-agent/components/decisions/DecisionsTab"
import { CriteriaTab } from "@/features/secretary-agent/components/CriteriaTab"
import { DEFAULT_SECRETARY_SETTINGS, type SecretarySettings } from "@/features/secretary-agent/schemas"

const contacts = [{ jid: "5531999999999@s.whatsapp.net", name: "Ana", number: "5531999999999", pictureUrl: null, isGroup: false, lastMessageAt: null }]
const query = (patch: Record<string, unknown>) => ({ isLoading: false, isError: false, error: null, refetch: mocks.refetch, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage: vi.fn(), ...patch })
const page = (items: unknown[], total = items.length) => ({ data: { pages: [{ items, page: 1, limit: 50, total, totalPages: 1 }] } })

beforeEach(() => {
    window.history.replaceState(null, "", "/integracoes/ia?aba=agente-secretario&secao=decisoes")
    mocks.params = []
})
afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe("aba Decisões do Secretário (OPE-197)", () => {
    it("D9/D10: filtros Conversa, Decisão e Período, sem campo de busca", () => {
        mocks.decisions.mockReturnValue(query(page([])))
        render(<DecisionsTab contacts={contacts} />)
        expect(screen.getByRole("button", { name: "Conversa" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Decisão" })).toBeTruthy()
        expect(screen.getByText("Período")).toBeTruthy()
        expect(screen.queryByRole("searchbox")).toBeNull()
        expect(document.querySelector("input[type=search], input[placeholder*='Buscar']")).toBeNull()
    })

    it("lista as decisões com o nome da conversa e manda o filtro de decisão para a API pela URL", () => {
        mocks.decisions.mockReturnValue(query(page([{ _id: "1", jid: contacts[0]!.jid, decision: "replied", reason: "Passou nos critérios", at: "2026-11-26T10:00:00.000Z" }])))
        render(<DecisionsTab contacts={contacts} />)
        expect(screen.getByText("Respondeu")).toBeTruthy()
        expect(screen.getByText(/Ana/)).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Decisão" }))
        fireEvent.click(screen.getByRole("option", { name: /Ignorou/ }))
        expect(window.location.search).toContain("decisoes=ignored")
        expect(window.location.search).toContain("secao=decisoes")
        expect(mocks.params.at(-1)).toEqual({ decision: "ignored" })
    })

    it("estados de carregando, vazio sem filtro (com atualizar), vazio filtrado e erro", () => {
        mocks.decisions.mockReturnValue(query({ isLoading: true }))
        const { rerender } = render(<DecisionsTab contacts={contacts} />)
        expect(screen.getByLabelText("Carregando decisões")).toBeTruthy()
        mocks.decisions.mockReturnValue(query(page([])))
        rerender(<DecisionsTab contacts={contacts} />)
        fireEvent.click(screen.getByRole("button", { name: "Atualizar decisões" }))
        expect(mocks.refetch).toHaveBeenCalledTimes(1)
        window.history.replaceState(null, "", "/integracoes/ia?aba=agente-secretario&secao=decisoes&decisoes=error")
        rerender(<DecisionsTab contacts={contacts} />)
        expect(screen.getByText("Nenhuma decisão com estes filtros")).toBeTruthy()
        mocks.decisions.mockReturnValue(query({ isError: true }))
        rerender(<DecisionsTab contacts={contacts} />)
        expect(screen.getByText("Não foi possível carregar as decisões")).toBeTruthy()
    })

    it("o registro de decisões não aparece mais na aba Critérios", () => {
        function Criteria() {
            const form = useForm<SecretarySettings>({ defaultValues: DEFAULT_SECRETARY_SETTINGS })
            return <CriteriaTab form={form} contacts={contacts} />
        }
        render(<Criteria />)
        expect(screen.getByText("Etapa 1 · Quem pode ser respondido")).toBeTruthy()
        expect(screen.queryByText("Registro de decisões")).toBeNull()
    })
})
