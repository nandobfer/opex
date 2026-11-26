/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), data: undefined as unknown }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/evolution-api/hooks/useEvolution", () => ({ useEvolutionAction: () => ({ mutate: mocks.mutate, isPending: false, data: mocks.data }) }))

import { ConnectedProfile, PairingCode, QrConnect } from "@/features/evolution-api/components/InstanceTab"
import { ConversationLabel } from "@/features/evolution-api/components/ConversationPicker"

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

describe("ConnectedProfile", () => {
    it("mostra o nome em cima e o @usuário com o número formatado embaixo", () => {
        const { container } = render(<ConnectedProfile profile={{ name: "Fernando", number: "5541984556795", pictureUrl: null, username: "nandoburgos" }} />)
        expect(screen.getByTestId("evolution-profile-name").textContent).toBe("Fernando")
        expect(container.textContent).toContain("@nandoburgos · +55 (41) 9 8455-6795")
    })

    it("sem nome nem usuário, mostra o aviso e só o número", () => {
        const { container } = render(<ConnectedProfile profile={{ name: null, number: "5541984556795", pictureUrl: null, username: null }} />)
        expect(screen.getByTestId("evolution-profile-name").textContent).toBe("WhatsApp sem nome de exibição")
        expect(container.textContent).toContain("+55 (41) 9 8455-6795")
        expect(container.textContent).not.toContain("@")
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
