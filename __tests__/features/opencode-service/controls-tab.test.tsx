/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { OpencodeServiceStatusDto } from "@/features/opencode-service/types"

const mocks = vi.hoisted(() => ({ status: vi.fn(), action: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/opencode-service/hooks/useOpencodeService", () => ({
    useOpencodeServiceStatus: mocks.status,
    useOpencodeServiceRealtime: vi.fn(),
    useOpencodeLogs: () => ({ data: { lines: "linha 1", source: "ssh" }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
    useServiceAction: () => ({ mutate: mocks.action, isPending: false, variables: undefined }),
    useReadHostFingerprint: () => ({ mutate: vi.fn(), isPending: false }),
    useTrustHostKey: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/opencode-resources/hooks/useOpencodeResources", () => ({
    useOpencodeResourcesRealtime: vi.fn(),
    useOpencodeBackups: () => ({ data: [], isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
    useRestoreOpencodeBackup: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { OpencodeControlsTab } from "@/features/opencode-service/components/OpencodeControlsTab"

const status = (over: Partial<OpencodeServiceStatusDto> = {}): OpencodeServiceStatusDto => ({
    state: "running",
    reason: null,
    baseUrl: "http://h:5050",
    version: "2.2.1",
    pid: 10,
    port: 5050,
    uptimeSeconds: 3_900,
    ssh: { configured: true, trusted: true, host: "h", port: 22, user: "u", fingerprint: "SHA256:abc", bin: "/b/opencode" },
    update: { current: "2.2.1", latestSupported: "2.2.2", latestMajor: null, available: true },
    operation: null,
    impact: { workbenches: 2, refinements: 1 },
    checkedAt: "2026-10-30T00:00:00Z",
    ...over,
})
const ready = (data: OpencodeServiceStatusDto) => ({ data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.status.mockReturnValue(ready(status()))
})
afterEach(cleanup)

describe("aba Controles do OpenCode", () => {
    it("mostra status, versão, porta e tempo no ar; Iniciar desabilitado com o serviço no ar", () => {
        render(<OpencodeControlsTab dirty={false} />)
        expect(screen.getByText("Em execução")).toBeTruthy()
        expect(screen.getByText("5050")).toBeTruthy()
        expect(screen.getByText("1 h 05 min")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Iniciar" }).hasAttribute("disabled")).toBe(true)
        expect(screen.getByText("linha 1")).toBeTruthy()
    })

    it("reiniciar pede confirmação avisando as mesas e refinamentos em andamento", () => {
        render(<OpencodeControlsTab dirty={false} />)
        fireEvent.click(screen.getByRole("button", { name: "Reiniciar serviço" }))
        expect(screen.getByText(/interrompe 2 mesa\(s\) e 1 refinamento\(s\)/)).toBeTruthy()
        expect(mocks.action).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Reiniciar" }))
        expect(mocks.action).toHaveBeenCalledWith({ action: "restart", body: {} }, expect.anything())
    })

    it("atualizar vai para a última 2.x com confirmação", () => {
        render(<OpencodeControlsTab dirty={false} />)
        fireEvent.click(screen.getByRole("button", { name: "Atualizar OpenCode (2.2.2)" }))
        fireEvent.click(screen.getByRole("button", { name: "Atualizar OpenCode" }))
        expect(mocks.action).toHaveBeenCalledWith({ action: "upgrade", body: { version: "2.2.2", allowMajor: undefined } }, expect.anything())
    })

    it("sem SSH confiado não mostra as ações e orienta a configurar", () => {
        mocks.status.mockReturnValue(ready(status({ state: "unknown", version: null, ssh: { configured: false, trusted: false, host: null, port: 22, user: null, fingerprint: null, bin: null } })))
        render(<OpencodeControlsTab dirty={false} />)
        expect(screen.queryByRole("button", { name: "Reiniciar serviço" })).toBeNull()
        expect(screen.getByText(/configure e confie no acesso SSH/)).toBeTruthy()
        expect(screen.getByText("Não configurado")).toBeTruthy()
    })
})
