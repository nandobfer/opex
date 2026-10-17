/** @vitest-environment jsdom */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { EnvironmentDetail } from "@/features/environments/types"

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), detail: null as EnvironmentDetail | null }))
vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock("@/features/environments/hooks/useEnvironments", () => ({
    useEnvironmentOperation: () => ({ mutate: mocks.mutate, isPending: false }),
    useEnvironmentApi: () => ({ href: "/ambientes", key: ["environments", false, ""], get: vi.fn(), send: vi.fn() }),
    useEnvironmentDetail: () => ({ data: mocks.detail, isLoading: false, isError: false }),
    useEnvironmentRepoConfig: () => ({
        data: { canEdit: true, canManageSecrets: true },
        isLoading: false,
        isError: false,
    }),
    useSaveEnvironment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { EnvironmentPanel } from "@/features/environments/components/EnvironmentPanel"
import { PublishTab } from "@/features/environments/components/PublishTab"
import { RestoreTab } from "@/features/environments/components/RestoreTab"
import { config, repoId, envId, imageId, observed } from "./fixtures"

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const detail = (): EnvironmentDetail => ({
    environment: {
        ...config,
        id: envId,
        projectId: repoId,
        revision: 2,
        dbVersion: null,
        observedAt: null,
        compose: [],
        activeOperationId: null,
    },
    images: [
        {
            id: imageId,
            version: "app:1",
            dbVersion: null,
            builtAt: null,
            origin: "external",
            images: observed.images,
        },
    ],
    operations: [],
    canEdit: true,
    canManageSecrets: true,
})

// Navegador em HTTP num IP da rede (contexto não seguro): `crypto` existe, mas sem `randomUUID`.
beforeEach(() => {
    mocks.detail = detail()
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.map((_, index) => (index * 37) % 256) })
})
afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe("ações do ambiente em contexto HTTP (sem crypto.randomUUID)", () => {
    it("inspecionar o host envia requestId UUID", () => {
        render(<EnvironmentPanel repoId={repoId} envId={envId} />)
        const inspect = screen.getByRole("button", { name: /Inspecionar/ })
        // A ação principal do card usa a variante primária (padrão das telas de desenvolvimento).
        expect(inspect.className).toContain("bg-primary")
        fireEvent.click(inspect)
        expect(mocks.mutate).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "inspect", requestId: expect.stringMatching(UUID_V4) }),
        )
    })

    it("publicar envia requestId UUID", () => {
        render(<PublishTab repoId={repoId} data={detail()} />)
        fireEvent.click(screen.getByRole("button", { name: "Publicar versão" }))
        fireEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }))
        expect(mocks.mutate).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "publish", requestId: expect.stringMatching(UUID_V4) }),
            expect.any(Object),
        )
    })

    it("restaurar envia requestId UUID", () => {
        render(<RestoreTab repoId={repoId} data={detail()} />)
        fireEvent.click(screen.getByRole("button", { name: "Restaurar esta versão" }))
        fireEvent.click(screen.getByRole("checkbox"))
        fireEvent.click(screen.getByRole("button", { name: "Confirmar restauração" }))
        expect(mocks.mutate).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "restore", imageId, requestId: expect.stringMatching(UUID_V4) }),
            expect.any(Object),
        )
    })
})
