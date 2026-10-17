/** @vitest-environment jsdom */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { EnvironmentDetail } from "@/features/environments/types"
const mocks = vi.hoisted(() => ({
    mutate: vi.fn(),
    save: vi.fn(),
    replace: vi.fn(),
    detail: null as EnvironmentDetail | null,
}))
vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock("next/link", () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock("@/features/environments/hooks/useEnvironments", () => ({
    useEnvironmentOperation: () => ({ mutate: mocks.mutate, isPending: false }),
    useEnvironmentApi: () => ({ href: "/ambientes" }),
    useEnvironmentDetail: () => ({ data: mocks.detail, isLoading: false, isError: false }),
    useEnvironmentRepoConfig: () => ({
        data: { canEdit: true, canManageSecrets: true },
        isLoading: false,
        isError: false,
    }),
    useSaveEnvironment: () => ({ mutateAsync: mocks.save, isPending: false }),
}))
import { PublishTab } from "@/features/environments/components/PublishTab"
import { RestoreTab } from "@/features/environments/components/RestoreTab"
import { EnvironmentEditor } from "@/features/environments/components/EnvironmentEditor"
import { OperationsHistory } from "@/features/environments/components/OperationsHistory"
import { config, repoId, envId, imageId, observed } from "./fixtures"
const detail = (): EnvironmentDetail => ({
    environment: {
        ...config,
        id: envId,
        projectId: repoId,
        revision: 2,
        dbVersion: "m002",
        observedAt: null,
        compose: [],
        activeOperationId: null,
    },
    images: [
        {
            id: imageId,
            version: "app:1",
            dbVersion: null,
            builtAt: new Date().toISOString(),
            origin: "external",
            images: observed.images,
        },
    ],
    operations: [],
    canEdit: true,
    canManageSecrets: true,
})
beforeEach(() => {
    vi.clearAllMocks()
    mocks.detail = detail()
    mocks.save.mockResolvedValue(detail().environment)
})
afterEach(cleanup)
describe("confirmações e formulário do ambiente", () => {
    it("falha com código conhecido mostra a orientação, não o texto cru do agente", () => {
        render(
            <OperationsHistory
                operations={[
                    {
                        id: "op-1",
                        environmentId: envId,
                        kind: "inspect",
                        state: "failed",
                        stage: "Falhou",
                        steps: [],
                        error: 'Envelope ausente\n```json\n{"verified":false}\n```',
                        failureCode: "ACCESS_ENVELOPE_MISSING",
                        createdAt: new Date().toISOString(),
                        finishedAt: null,
                        sessionId: null,
                        evidence: [],
                        migrations: [],
                        runUrl: null,
                    },
                ]}
            />,
        )
        const alert = screen.getByRole("alert").textContent ?? ""
        expect(alert).toContain("URL base do agente")
        expect(alert).not.toContain("verified")
    })
    it("Publicar não executa antes da confirmação explícita", () => {
        render(<PublishTab repoId={repoId} data={detail()} />)
        fireEvent.click(screen.getByRole("button", { name: "Publicar versão" }))
        expect(mocks.mutate).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }))
        expect(mocks.mutate).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "publish", confirmation: true, expectedRevision: 2 }),
            expect.any(Object),
        )
    })
    it("banco desconhecido exige marcar o risco para confirmar restauração", () => {
        render(<RestoreTab repoId={repoId} data={detail()} />)
        fireEvent.click(screen.getByRole("button", { name: "Restaurar esta versão" }))
        expect((screen.getByRole("button", { name: "Confirmar restauração" }) as HTMLButtonElement).disabled).toBe(true)
        fireEvent.click(screen.getByRole("checkbox"))
        fireEvent.click(screen.getByRole("button", { name: "Confirmar restauração" }))
        expect(mocks.mutate).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "restore", riskConfirmed: true, imageId }),
            expect.any(Object),
        )
    })
    it("incompatibilidade bloqueia e banco permanece Em desenvolvimento", () => {
        const data = detail()
        data.images[0].dbVersion = "m001"
        render(<RestoreTab repoId={repoId} data={data} />)
        expect((screen.getByRole("button", { name: "Restaurar esta versão" }) as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByText("Restaurar banco — Em desenvolvimento")).toBeTruthy()
    })
    it("ação principal usa a variante primária e a de linha fica secundária", () => {
        const { unmount } = render(<PublishTab repoId={repoId} data={detail()} />)
        expect(screen.getByRole("button", { name: "Publicar versão" }).className).toContain("bg-primary")
        unmount()
        render(<RestoreTab repoId={repoId} data={detail()} />)
        expect(screen.getByRole("button", { name: "Restaurar esta versão" }).className).not.toContain("bg-primary")
    })
    it("editar DTO não injeta id/revision no schema estrito da API", async () => {
        render(<EnvironmentEditor repoId={repoId} envId={envId} />)
        await waitFor(() => expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe(config.name))
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Produção atualizada" } })
        // A validade com o resolver do zod é assíncrona: o botão habilita depois da validação.
        await waitFor(() => expect((screen.getByRole("button", { name: "Salvar ambiente" }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: "Salvar ambiente" }))
        await waitFor(() => expect(mocks.save).toHaveBeenCalled())
        expect(mocks.save.mock.calls[0][0]).toEqual({ config: { ...config, name: "Produção atualizada" }, revision: 2 })
    })
})
