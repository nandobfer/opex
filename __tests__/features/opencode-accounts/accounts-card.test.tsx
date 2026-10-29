/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { OpencodeAuthProviderDto } from "@/features/opencode-accounts/types"

const mocks = vi.hoisted(() => ({ accounts: vi.fn(), refetch: vi.fn(), activate: vi.fn(), remove: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/opencode-accounts/hooks/useOpencodeAccounts", () => {
    const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
    return {
        useOpencodeAccounts: mocks.accounts,
        useOpencodeAccountsRealtime: vi.fn(),
        useActivateOpencodeAccount: () => ({ ...idle, mutate: mocks.activate }),
        useRemoveOpencodeAccount: () => ({ ...idle, mutate: mocks.remove }),
        useRenameOpencodeAccount: () => idle,
        useConnectOpencodeKey: () => idle,
        useStartOpencodeOauth: () => idle,
        useStartOpencodeCommand: () => idle,
        useCompleteOpencodeOauth: () => idle,
        useOpencodeLoginStatus: () => ({ data: undefined, isError: false }),
        cancelOpencodeLogin: vi.fn(),
    }
})

import { OpencodeAccountsCard } from "@/features/opencode-accounts/components/OpencodeAccountsCard"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"

const anthropic: OpencodeAuthProviderDto = {
    id: "anthropic",
    name: "Anthropic",
    providers: ["Anthropic"],
    methods: [{ kind: "key", id: "key", label: "Chave de API", fields: [] }],
    envNames: [],
    accounts: [
        { id: "cred_a", label: "Pessoal", method: "key", active: true, needsAuth: null },
        { id: "cred_b", label: "Trabalho", method: "oauth", active: false, needsAuth: null },
    ],
    envConnections: [],
    activeAccountId: "cred_a",
    connected: true,
}
const zeta: OpencodeAuthProviderDto = { ...anthropic, id: "zeta", name: "Zeta AI", providers: [], accounts: [], activeAccountId: null, connected: false }

const ready = (data: OpencodeAuthProviderDto[]) => ({ data, isLoading: false, isError: false, isFetching: false, refetch: mocks.refetch })
const inPage = (ui: React.ReactNode) => render(<main id={APP_SCROLL_CONTAINER_ID}>{ui}</main>)

beforeEach(() => {
    vi.clearAllMocks()
    mocks.accounts.mockReturnValue(ready([anthropic, zeta]))
})
afterEach(cleanup)

describe("aba Contas do OpenCode", () => {
    it("mostra só os conectados com a conta em uso; buscar mostra todos", () => {
        inPage(<OpencodeAccountsCard dirty={false} />)
        expect(screen.getByText("Anthropic")).toBeTruthy()
        expect(screen.getByText("Pessoal")).toBeTruthy()
        expect(screen.queryByText("Zeta AI")).toBeNull()
        fireEvent.change(screen.getByLabelText("Buscar provider"), { target: { value: "zeta" } })
        expect(screen.getByText("Zeta AI")).toBeTruthy()
        expect(screen.getByText("Não conectado")).toBeTruthy()
    })

    it("expande o provider para selecionar outra conta", () => {
        inPage(<OpencodeAccountsCard dirty={false} />)
        fireEvent.click(screen.getByRole("button", { name: /Anthropic/ }))
        expect(screen.getByText("Em uso")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Usar esta conta" }))
        expect(mocks.activate).toHaveBeenCalledWith({ integrationId: "anthropic", accountId: "cred_b" })
    })

    it("remover pede confirmação e avisa quando é a conta em uso", () => {
        inPage(<OpencodeAccountsCard dirty={false} />)
        fireEvent.click(screen.getByRole("button", { name: /Anthropic/ }))
        fireEvent.click(screen.getByRole("button", { name: "Remover Pessoal" }))
        expect(mocks.remove).not.toHaveBeenCalled()
        expect(screen.getByText(/Esta é a conta em uso/)).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Remover" }))
        expect(mocks.remove).toHaveBeenCalledWith({ accountId: "cred_a" }, expect.anything())
    })

    it("acima de 50 providers desenha só os visíveis", () => {
        const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800)
        const many = Array.from({ length: 200 }, (_, index) => ({ ...anthropic, id: `p${index}`, name: `Provider ${String(index).padStart(3, "0")}` }))
        mocks.accounts.mockReturnValue(ready(many))
        inPage(<OpencodeAccountsCard dirty={false} />)
        const rendered = screen.getAllByText(/^Provider \d{3}$/)
        expect(rendered.length).toBeGreaterThan(0)
        expect(rendered.length).toBeLessThan(200)
        expect(rendered[0]!.textContent).toBe("Provider 000")
        height.mockRestore()
    })

    it("sem conectados, oferece mostrar todos", () => {
        mocks.accounts.mockReturnValue(ready([zeta]))
        inPage(<OpencodeAccountsCard dirty={false} />)
        expect(screen.getByText("Nenhum provider conectado")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Mostrar todos" }))
        expect(screen.getByText("Zeta AI")).toBeTruthy()
    })

    it("erro com tentar novamente e aviso com alterações não salvas", () => {
        mocks.accounts.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("x"), isFetching: false, refetch: mocks.refetch })
        inPage(<OpencodeAccountsCard dirty={false} />)
        expect(screen.getByText("Não foi possível listar os providers")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }))
        expect(mocks.refetch).toHaveBeenCalled()
        cleanup()
        inPage(<OpencodeAccountsCard dirty />)
        expect(screen.getByText(/Salve as alterações/)).toBeTruthy()
        expect(mocks.accounts).toHaveBeenLastCalledWith(false)
    })
})
