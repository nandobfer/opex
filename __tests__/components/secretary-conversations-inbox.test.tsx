// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import type { ChatMessageDto } from "@/features/evolution-api/chat-message"
import type { ChatTimelinePageDto, SecretaryConversationDto } from "@/features/secretary-agent/types"

const mocks = vi.hoisted(() => ({
    rows: [] as unknown[],
    page: null as unknown,
    action: vi.fn(),
    post: vi.fn(),
    toastError: vi.fn(),
}))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/api", () => ({ api: { post: mocks.post }, apiErrorMessage: (_error: unknown, fallback: string) => fallback }))
vi.mock("@/features/evolution-api/components/EvolutionSyncAction", () => ({ EvolutionSyncAction: () => null }))
vi.mock("@/features/secretary-agent/hooks/useSecretaryChat", () => ({
    useSecretaryConversations: () => ({ data: mocks.rows, isPending: false, isError: false, refetch: vi.fn() }),
    useChatTimeline: () => ({ data: mocks.page ? { pages: [mocks.page] } : undefined, isLoading: false, isError: false, refetch: vi.fn(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
    useSecretaryChatRealtime: vi.fn(),
    useConversationAction: () => ({ mutate: mocks.action, isPending: false }),
    timelineKey: (chatId: string) => ["k", chatId],
    timelinePath: (chatId: string) => `/secretary/conversations/${chatId}/messages`,
}))

import { ConversationsInbox } from "@/features/secretary-agent/components/conversations/ConversationsInbox"
import { chatOutbox } from "@/features/secretary-agent/hooks/chat-outbox"
import { useConversationActions } from "@/features/secretary-agent/components/conversations/ConversationActions"
import { SecretaryMemoriesLinkProvider } from "@/features/secretary-agent/components/conversations/memories-link"
import { SecretaryConversationsSkeleton } from "@/features/secretary-agent/components/conversations/SecretaryConversationsTab"
import { SECRETARY_PAGE_TABS, secretaryPagePath, secretarySectionPath } from "@/features/secretary-agent/links"
import { CONVERSATION_PARAM } from "@/features/secretary-agent/memory-focus"

const row = (patch: Partial<SecretaryConversationDto>): SecretaryConversationDto => ({ jid: "5531999999999@s.whatsapp.net", chatId: "5531999999999", name: "Ana", number: "5531999999999", pictureUrl: null, isGroup: false, lastMessageAt: new Date().toISOString(), lastMessage: { text: "oi", kind: "text", fromMe: false }, unreadCount: 2, state: "active", pausedUntil: null, ...patch })
const message = (id: string, patch: Partial<ChatMessageDto> = {}): ChatMessageDto => ({ id, chatJid: "5531999999999@s.whatsapp.net", fromMe: false, author: null, authorName: null, timestamp: "2026-11-26T10:00:00.000Z", kind: "text", text: id, media: null, quoted: null, location: null, contacts: [], reactions: [], edited: false, status: null, ...patch })

function renderInbox() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
        <QueryClientProvider client={client}>
            <form onSubmit={submitSpy}>
                <ConversationsInbox minutes={30} contacts={[]} />
            </form>
        </QueryClientProvider>
    )
    const view = render(tree())
    return { ...view, refresh: () => view.rerender(tree()) }
}
const submitSpy = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())

beforeEach(() => {
    chatOutbox.reset()
    mocks.rows = [row({}), row({ chatId: "5521988887777", jid: "5521988887777@s.whatsapp.net", name: "Bruno", unreadCount: 0, state: "paused", pausedUntil: "2026-11-26T12:00:00.000Z" })]
    mocks.page = { nextBefore: null, hasOlder: false, effects: { reactions: [], edits: [], revoked: [] }, items: [message("Oi Ana"), message("Já vou", { fromMe: true, timestamp: "2026-11-26T10:02:00.000Z" })], decisions: [{ id: "d1", decision: "replied", reason: "Passou nos critérios", at: "2026-11-26T10:01:00.000Z" }], agentMessageIds: ["Já vou"] } satisfies ChatTimelinePageDto
    window.history.replaceState(null, "", "/integracoes/ia?aba=agente-secretario&secao=conversas")
})
afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.restoreAllMocks()
})

describe("Abrir memórias depende da tela (OPE-207)", () => {
    const conversation = { chatId: "5531999999999", name: "Ana", state: "active" as const }

    it("sem provider: seção Memórias de Integrações › IA › Agente Secretário", () => {
        const { result } = renderHook(() => useConversationActions(conversation, 30))
        expect(result.current.memoriesHref).toBe(secretarySectionPath("memorias", { [CONVERSATION_PARAM]: "5531999999999" }))
    })

    it("clique simples troca a aba na hora pelo histórico (sem ida ao servidor); Ctrl+clique segue como link", async () => {
        window.history.replaceState(null, "", "/agente-secretario")
        const href = (chatId: string) => secretaryPagePath(SECRETARY_PAGE_TABS.memorias, { [CONVERSATION_PARAM]: chatId })
        const client = new QueryClient()
        render(
            <QueryClientProvider client={client}>
                <SecretaryMemoriesLinkProvider href={href}>
                    <ConversationsInbox minutes={30} contacts={[]} />
                </SecretaryMemoriesLinkProvider>
            </QueryClientProvider>,
        )
        const openMenu = async () => {
            const trigger = screen.getByRole("button", { name: "Ações da conversa com Ana" })
            fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
            return await screen.findByRole("menuitem", { name: "Abrir memórias" })
        }
        const pushState = vi.spyOn(window.history, "pushState")
        const modified = await openMenu()
        expect(fireEvent.click(modified, { ctrlKey: true })).toBe(true)
        expect(pushState).not.toHaveBeenCalled()
        const item = screen.queryByRole("menuitem", { name: "Abrir memórias" }) ?? await openMenu()
        // `false`: o clique foi cancelado (sem a navegação do Next) e a URL trocou pelo histórico.
        expect(fireEvent.click(item)).toBe(false)
        expect(pushState).toHaveBeenCalledTimes(1)
        const params = new URLSearchParams(window.location.search)
        expect(window.location.pathname).toBe("/agente-secretario")
        expect(params.get("aba")).toBe(SECRETARY_PAGE_TABS.memorias)
        expect(params.get(CONVERSATION_PARAM)).toBe("5531999999999")
        pushState.mockRestore()
    })

    it("com o provider da página do agente: aba Memórias da própria página", () => {
        const href = (chatId: string) => secretaryPagePath(SECRETARY_PAGE_TABS.memorias, { [CONVERSATION_PARAM]: chatId })
        const { result } = renderHook(() => useConversationActions(conversation, 30), { wrapper: ({ children }) => <SecretaryMemoriesLinkProvider href={href}>{children}</SecretaryMemoriesLinkProvider> })
        expect(result.current.memoriesHref).toBe(secretaryPagePath(SECRETARY_PAGE_TABS.memorias, { [CONVERSATION_PARAM]: "5531999999999" }))
    })
})

describe("altura do card: o restante da área visível (OPE-207)", () => {
    function mountInMain(clientHeight: number, resize = true) {
        const client = new QueryClient()
        const view = render(
            <main style={{ overflowY: "auto" }}>
                <QueryClientProvider client={client}>
                    <ConversationsInbox minutes={30} contacts={[]} />
                </QueryClientProvider>
                <SecretaryConversationsSkeleton />
            </main>,
        )
        const main = view.container.querySelector("main")!
        Object.defineProperty(main, "clientHeight", { configurable: true, value: clientHeight })
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            const top = this === main ? 0 : 150
            return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect
        })
        if (resize) fireEvent(window, new Event("resize"))
    }
    const heights = () => [screen.getByTestId("secretary-inbox"), screen.getByTestId("secretary-inbox-skeleton")].map((element) => element.style.height)

    it("inbox e skeleton com a mesma altura medida até o fim do <main>", async () => {
        mountInMain(800)
        await waitFor(() => expect(heights()).toEqual(["650px", "650px"]))
        expect(screen.getByTestId("secretary-inbox").className).not.toContain("100dvh")
    })

    it("mede de novo depois da entrada animada da aba, sem precisar de resize", async () => {
        mountInMain(800, false)
        await waitFor(() => expect(heights()).toEqual(["650px", "650px"]))
    })

    it("tela baixa: fica no mínimo de 480 px (a página rola)", async () => {
        mountInMain(500)
        await waitFor(() => expect(heights()).toEqual(["480px", "480px"]))
    })
})

describe("aba Conversas como conversa (OPE-197)", () => {
    it("lista com não lidas do WhatsApp e o chip Não lidas", () => {
        renderInbox()
        const list = screen.getByRole("list", { name: "Conversas" })
        expect(within(list).getByLabelText("2 não lidas")).toBeTruthy()
        expect(within(list).getByText("Bruno")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Não lidas" }))
        expect(within(list).queryByText("Bruno")).toBeNull()
        expect(window.location.search).toContain("filtro=nao_lidas")
    })

    it("abre pela URL; D3: pílula da decisão e selo Secretário; D6: nada de marcar como lida", () => {
        window.history.replaceState(null, "", "/integracoes/ia?aba=agente-secretario&secao=conversas&conversa=5531999999999")
        renderInbox()
        const chat = screen.getByRole("region", { name: "Conversa aberta" })
        expect(within(chat).getByText("Secretário · Respondeu: Passou nos critérios")).toBeTruthy()
        expect(chat.querySelector("[data-from-agent]")?.closest("[data-message-id]")?.getAttribute("data-message-id")).toBe("Já vou")
        expect(mocks.post).not.toHaveBeenCalled()
    })

    it("D4: ações no cabeçalho e no menu do item, com confirmação em Nunca responder", async () => {
        window.history.replaceState(null, "", "/integracoes/ia?aba=agente-secretario&secao=conversas&conversa=5531999999999")
        renderInbox()
        expect(screen.getByRole("button", { name: "Ações da conversa com Bruno" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Mais ações da conversa" })).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Pausar" }))
        expect(mocks.action).toHaveBeenCalledWith({ action: "pause", minutes: 30 })
        fireEvent.click(screen.getByRole("button", { name: "Nunca responder" }))
        expect(mocks.action).toHaveBeenCalledTimes(1)
        expect(await screen.findByText("Nunca responder a esta conversa?")).toBeTruthy()
    })

    it("envio otimista: o balão entra na hora e, em falha, mostra Reenviar e o toast; nenhum <form> aninhado", async () => {
        window.history.replaceState(null, "", "/integracoes/ia?aba=agente-secretario&secao=conversas&conversa=5531999999999")
        let reject: (error: unknown) => void = () => undefined
        mocks.post.mockImplementation(() => new Promise((_resolve, fail) => (reject = fail)))
        const { container } = renderInbox()
        expect(container.querySelectorAll("form form").length).toBe(0)
        const input = screen.getByRole("textbox", { name: "Mensagem" })
        fireEvent.change(input, { target: { value: "chego às 8" } })
        await waitFor(() => expect(screen.getByRole("button", { name: "Enviar mensagem" })).toBeTruthy())
        fireEvent.keyDown(input, { key: "Enter" })
        expect(await screen.findByText("chego às 8")).toBeTruthy()
        expect(mocks.post).toHaveBeenCalledWith("/secretary/conversations/5531999999999/messages", { type: "text", text: "chego às 8", quotedId: undefined })
        await act(async () => reject(new Error("fora")))
        expect(await screen.findByRole("button", { name: "Reenviar" })).toBeTruthy()
        expect(mocks.toastError).toHaveBeenCalledWith("Não foi possível enviar a mensagem")
        expect(submitSpy).not.toHaveBeenCalled()
    })

    it("envio com sucesso: o balão temporário some quando a página do servidor traz a mensagem, sem duplicar", async () => {
        window.history.replaceState(null, "", "/integracoes/ia?aba=agente-secretario&secao=conversas&conversa=5531999999999")
        mocks.post.mockResolvedValue({ data: { success: true, data: { id: "REAL" } } })
        const view = renderInbox()
        const input = screen.getByRole("textbox", { name: "Mensagem" })
        fireEvent.change(input, { target: { value: "chego às 9" } })
        await waitFor(() => expect(screen.getByRole("button", { name: "Enviar mensagem" })).toBeTruthy())
        fireEvent.keyDown(input, { key: "Enter" })
        expect(await screen.findByText("chego às 9")).toBeTruthy()
        await waitFor(() => expect(chatOutbox.snapshot()[0]?.realId).toBe("REAL"))
        expect(screen.getByText("chego às 9").closest("[data-message-id]")?.getAttribute("data-status")).toBe("sent")
        const current = mocks.page as ChatTimelinePageDto
        mocks.page = { ...current, items: [...current.items, message("REAL", { fromMe: true, text: "chego às 9", timestamp: "2026-11-26T10:05:00.000Z" })] }
        view.refresh()
        await waitFor(() => expect(chatOutbox.snapshot()).toEqual([]))
        expect(screen.getAllByText("chego às 9")).toHaveLength(1)
        expect(screen.getByText("chego às 9").closest("[data-message-id]")?.getAttribute("data-message-id")).toBe("REAL")
    })
})
