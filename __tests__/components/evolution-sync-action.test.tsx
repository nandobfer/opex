/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

const mocks = vi.hoisted(() => ({
    mutate: vi.fn(),
    data: {} as Record<string, unknown>,
    paths: [] as string[],
}))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/evolution-api/hooks/useEvolution", () => ({
    useEvolution: (path: string) => ({ data: mocks.data[path], isPending: false, isError: false, refetch: vi.fn() }),
    useEvolutionAction: (path: string) => {
        mocks.paths.push(path)
        return { mutate: mocks.mutate, isPending: false, data: undefined }
    },
}))
vi.mock("@/features/secretary-agent/hooks/useSecretaryChat", () => ({
    useSecretaryConversations: () => ({ data: mocks.data["/secretary/conversations"], isPending: false, isError: false, refetch: vi.fn() }),
    useSecretaryChatRealtime: vi.fn(),
    useConversationAction: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { ConversationsInbox } from "@/features/secretary-agent/components/conversations/ConversationsInbox"

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    mocks.paths = []
})

describe("aba Conversas vazia", () => {
    it("mostra a ação de sincronizar e chama POST /evolution/contacts", () => {
        mocks.data = { "/secretary/conversations": [], "/evolution/instances": { defaultInstance: "opex", instances: [], error: null } }
        render(<ConversationsInbox minutes={30} contacts={[]} />)
        expect(screen.getByText("Nenhuma conversa ainda.")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Sincronizar contatos e conversas/ }))
        expect(mocks.mutate).toHaveBeenCalledTimes(1)
        expect(mocks.paths).toContain("/evolution/contacts")
    })

    it("sem instância escolhida, leva à aba Instância da integração", () => {
        mocks.data = { "/secretary/conversations": [], "/evolution/instances": { defaultInstance: null, instances: [], error: null } }
        render(<ConversationsInbox minutes={30} contacts={[]} />)
        expect(screen.queryByRole("button", { name: /Sincronizar/ })).toBeNull()
        expect(screen.getByRole("link", { name: "Abrir a integração Evolution API" }).getAttribute("href")).toBe("/integracoes/evolution-api?aba=instancia")
    })
})
