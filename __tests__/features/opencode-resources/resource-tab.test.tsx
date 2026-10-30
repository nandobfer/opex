/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { OpencodeResourceDto } from "@/features/opencode-resources/types"

const mocks = vi.hoisted(() => ({ list: vi.fn(), toggle: vi.fn(), remove: vi.fn(), updateMany: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/opencode-resources/hooks/useOpencodeResources", () => {
    const idle = { mutate: vi.fn(), isPending: false, variables: undefined }
    return {
        useOpencodeResources: mocks.list,
        useOpencodeResourcesRealtime: vi.fn(),
        useOpencodeScopes: () => ({ data: [{ id: "global", label: "Global (usuário)", directory: null }] }),
        useToggleOpencodeResource: () => ({ ...idle, mutate: mocks.toggle }),
        useDeleteOpencodeResource: () => ({ ...idle, mutate: mocks.remove }),
        useUpdateOpencodeResources: () => ({ ...idle, mutate: mocks.updateMany }),
        useCreateOpencodeResource: () => idle,
        useUpdateOpencodeResource: () => idle,
        useInstallOpencodeResource: () => idle,
        useOpencodeResource: () => ({ data: undefined, isLoading: false, isError: false }),
        useTestMcp: () => ({ ...idle, reset: vi.fn() }),
        refreshOpencodeResources: vi.fn(),
        resourcesKey: (kind: string, scope: string) => ["r", kind, scope],
    }
})

import { OpencodeResourceTab } from "@/features/opencode-resources/components/OpencodeResourceTab"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const item = (over: Partial<OpencodeResourceDto>): OpencodeResourceDto => ({
    id: over.name ?? "x",
    kind: "plugin",
    name: "x",
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

const ready = (data: OpencodeResourceDto[]) => ({ data, isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() })
const inPage = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><main id={APP_SCROLL_CONTAINER_ID}>{ui}</main></QueryClientProvider>)

beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockReturnValue(
        ready([
            item({ name: "alfa-plugin", version: { installed: "1.0.0", available: "1.2.0", outdated: true } }),
            item({ name: "beta-plugin", enabled: false }),
            item({ name: "nativo", builtin: true, removable: false, origin: "local" }),
        ]),
    )
})
afterEach(cleanup)

describe("aba de recursos do OpenCode", () => {
    it("lista, busca pelo nome e filtra por situação", () => {
        inPage(<OpencodeResourceTab kind="plugin" dirty={false} />)
        expect(screen.getByText("alfa-plugin")).toBeTruthy()
        expect(screen.getByText("1.0.0 → 1.2.0")).toBeTruthy()
        fireEvent.change(screen.getByLabelText("Buscar plugins"), { target: { value: "beta" } })
        expect(screen.queryByText("alfa-plugin")).toBeNull()
        expect(screen.getByText("beta-plugin")).toBeTruthy()
        fireEvent.change(screen.getByLabelText("Buscar plugins"), { target: { value: "" } })
        fireEvent.click(screen.getByRole("radio", { name: "Com atualização" }))
        expect(screen.getByText("alfa-plugin")).toBeTruthy()
        expect(screen.queryByText("beta-plugin")).toBeNull()
    })

    it("liga/desliga pelo switch; nativo não pode ser desligado", () => {
        inPage(<OpencodeResourceTab kind="plugin" dirty={false} />)
        fireEvent.click(screen.getByLabelText("Ligar beta-plugin"))
        expect(mocks.toggle).toHaveBeenCalledWith({ id: "beta-plugin", enabled: true })
        expect(screen.getByLabelText("Desligar nativo").hasAttribute("disabled")).toBe(true)
    })

    it("Atualizar todos pede confirmação com a lista do que muda", () => {
        inPage(<OpencodeResourceTab kind="plugin" dirty={false} />)
        fireEvent.click(screen.getByRole("button", { name: /Atualizar todos \(1\)/ }))
        expect(screen.getByText("alfa-plugin: 1.0.0 → 1.2.0")).toBeTruthy()
        expect(mocks.updateMany).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Atualizar" }))
        expect(mocks.updateMany).toHaveBeenCalledWith({ all: true }, expect.anything())
    })

    it("estados vazio, erro e alterações não salvas", () => {
        mocks.list.mockReturnValue(ready([]))
        const { unmount } = inPage(<OpencodeResourceTab kind="skill" dirty={false} />)
        expect(screen.getByText("Nenhuma skill neste escopo")).toBeTruthy()
        unmount()
        mocks.list.mockReturnValue({ ...ready([]), data: undefined, isError: true, error: new Error("x") })
        const second = inPage(<OpencodeResourceTab kind="skill" dirty={false} />)
        expect(screen.getByText("Não foi possível listar skills")).toBeTruthy()
        second.unmount()
        inPage(<OpencodeResourceTab kind="skill" dirty />)
        expect(screen.getByText(/Salve as alterações da configuração/)).toBeTruthy()
    })
})
