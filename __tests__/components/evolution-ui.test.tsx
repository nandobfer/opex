/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), data: undefined as unknown }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/evolution-api/hooks/useEvolution", () => ({ useEvolutionAction: () => ({ mutate: mocks.mutate, isPending: false, data: mocks.data }) }))

import { PairingCode, QrConnect } from "@/features/evolution-api/components/InstanceTab"
import { ConversationLabel } from "@/features/evolution-api/components/ConversationPicker"
import { CriteriaTester } from "@/features/secretary-agent/components/CriteriaTab"

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe("pareamento", () => {
    it("QR mostra a contagem regressiva e some quando expira", () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-11-25T12:00:00Z"))
        render(<QrConnect qr={{ mode: "qr", base64: "data:image/png;base64,AAA", pairingCode: null, count: 2, limit: 30, generatedAt: "2026-11-25T12:00:00Z", expiresAt: "2026-11-25T12:00:05Z" }} />)
        expect(screen.getByText("Renova em 5 s · QR 2 de 30")).toBeTruthy()
        expect(screen.getByAltText("QR code de pareamento do WhatsApp")).toBeTruthy()
        act(() => vi.advanceTimersByTime(6000))
        expect(screen.getByText("Aguardando renovação do QR code…")).toBeTruthy()
        expect(screen.queryByAltText("QR code de pareamento do WhatsApp")).toBeNull()
    })

    it("código de pareamento aparece em fonte grande", () => {
        render(<PairingCode code="ABCD-EFGH" />)
        expect(screen.getByLabelText("Código de pareamento").textContent).toBe("ABCD-EFGH")
        expect(screen.getByLabelText("Código de pareamento").classList.contains("text-4xl")).toBe(true)
    })
})

describe("ConversationLabel", () => {
    it("mostra a foto, o nome e o número", () => {
        const { container } = render(<ConversationLabel contact={{ jid: "5531@s.whatsapp.net", name: "Mãe", number: "5531", pictureUrl: "https://pps.whatsapp.net/m.jpg", isGroup: false, lastMessageAt: null }} />)
        expect(screen.getByText("Mãe")).toBeTruthy()
        expect(screen.getByText("5531")).toBeTruthy()
        expect(container.querySelector("img")?.getAttribute("src")).toBe("https://pps.whatsapp.net/m.jpg")
    })

    it("sem foto usa a inicial", () => {
        const { container } = render(<ConversationLabel contact={{ jid: "1203@g.us", name: "Família", number: null, pictureUrl: null, isGroup: true, lastMessageAt: null }} />)
        expect(container.querySelector("img")).toBeNull()
        expect(screen.getByText("F")).toBeTruthy()
        expect(screen.getByText("Grupo")).toBeTruthy()
    })
})

describe("CriteriaTester", () => {
    it("mostra Responderia/Não responderia com a regra e o motivo", () => {
        mocks.data = { decision: "skip", rule: "subject-never", reason: "O assunto é um dos que nunca responde" }
        render(<CriteriaTester contacts={[]} criteria={undefined} />)
        expect(screen.getByRole("status").textContent).toContain("Não responderia")
        expect(screen.getByRole("status").textContent).toContain("Assunto \"nunca\"")
        fireEvent.change(screen.getByLabelText("Mensagem para testar"), { target: { value: "me empresta dinheiro" } })
        expect((screen.getByRole("button", { name: "Testar critérios" }) as HTMLButtonElement).disabled).toBe(true)
    })
})
