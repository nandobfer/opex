/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

const CONTACT = "5531999999999@s.whatsapp.net"
const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/secretary-agent/hooks/useSecretarySimulation", () => ({ useSecretarySimulation: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }) }))
vi.mock("@/features/evolution-api/components/ConversationPicker", () => ({
    ConversationPickerField: ({ onChange }: { onChange: (jids: string[]) => void }) => <button type="button" onClick={() => onChange([CONTACT])}>Escolher Ana</button>,
}))

import { SimulationTab } from "@/features/secretary-agent/components/simulation/SimulationTab"
import { DEFAULT_SECRETARY_SETTINGS, type SecretarySettings } from "@/features/secretary-agent/schemas"

const contacts = [{ jid: CONTACT, name: "Ana", number: "5531999999999", pictureUrl: null, isGroup: false, lastMessageAt: null }]
const base = {
    subject: null, limits: null, pausedUntil: null, personality: { variant: null }, memories: { counts: null, written: [] }, question: null, contact: null, observing: false, costUsd: 0.001,
    steps: [{ id: "blocked", label: "Está em \"Nunca responder a\"?", outcome: "pass", detail: "Não." }],
}

function Harness() {
    const form = useForm<SecretarySettings>({ defaultValues: DEFAULT_SECRETARY_SETTINGS })
    return <SimulationTab form={form} contacts={contacts} />
}

async function sendMessage(text: string) {
    fireEvent.change(screen.getByLabelText("Mensagem do contato"), { target: { value: text } })
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }))
}

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe("SimulationTab", () => {
    it("mostra o diagnóstico do 502 na coluna lateral e o limpa ao reiniciar", async () => {
        const message = "OpenCode Go recusou a chamada (HTTP 400)."
        mocks.mutateAsync.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: message } } })
        render(<Harness />)
        fireEvent.click(screen.getByRole("button", { name: "Escolher Ana" }))
        await sendMessage("oi")
        expect((await screen.findByRole("alert")).textContent).toBe(message)
        fireEvent.click(screen.getByRole("button", { name: "Reiniciar" }))
        expect(screen.queryByRole("alert")).toBeNull()
    })
    it("mostra a resposta em balões e a coluna lateral; Reiniciar limpa", async () => {
        mocks.mutateAsync.mockResolvedValueOnce({ ...base, contact: { name: "Ana Souza", number: "5531999999999", isGroup: false, groupName: null, author: null }, replies: ["oi!", "tudo sim"], decision: { decision: "reply", rule: "allowed", reason: "Passou", label: "Responderia" } })
        render(<Harness />)
        fireEvent.click(screen.getByRole("button", { name: "Escolher Ana" }))
        await sendMessage("oi, tudo bem?")
        await waitFor(() => expect(screen.getByText("tudo sim")).toBeTruthy())
        expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ jid: CONTACT, message: "oi, tudo bem?", useRealHistory: false, history: [] }))
        expect(screen.getByTestId("simulation-panel").textContent).toContain("Responderia")
        expect(screen.getByLabelText("Contato recebido pelo agente").textContent).toContain("Ana Souza")
        fireEvent.click(screen.getByRole("button", { name: "Reiniciar" }))
        expect(screen.queryByText("tudo sim")).toBeNull()
        expect(screen.queryByTestId("simulation-panel")).toBeNull()
    })

    it("quando não responderia, mostra a linha com o motivo no chat", async () => {
        mocks.mutateAsync.mockResolvedValueOnce({ ...base, replies: [], decision: { decision: "skip", rule: "subject-blocked", reason: "Assunto bloqueado (Dinheiro)", label: "Não responderia" } })
        render(<Harness />)
        fireEvent.click(screen.getByRole("button", { name: "Escolher Ana" }))
        await sendMessage("me empresta 50?")
        await waitFor(() => expect(screen.getByTestId("simulation-note").textContent).toContain("O Secretário não responderia: Assunto bloqueado (Dinheiro)"))
        expect(screen.getByTestId("simulation-panel").textContent).toContain("Não responderia")
    })
})
