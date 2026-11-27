/** @vitest-environment happy-dom */
import '../../helpers/integrations-render'

import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import { draftFrom } from "@nandobfer/integracoes/modules/react/central/detail/draft"
import { getIntegrationDef } from "@/features/integrations/registry/definitions"
import type { IntegrationDetailDto } from "@nandobfer/integracoes/modules/core/dto"

vi.mock('@/hooks/useInstanceInfo', () => ({ useInstanceInfo: () => ({ data: undefined }) }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a> }))
vi.mock("@nandobfer/integracoes/modules/react/central/detail/CronJobsCard", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
    CronJobsCard: ({ hiddenJobIds }: { hiddenJobIds?: ReadonlySet<string> }) => <div data-testid="cron-jobs" data-hidden={[...(hiddenJobIds ?? [])].join(",")} />,
}))(importOriginal)) as Record<string, unknown>), }))
const builderMachine = vi.hoisted(() => ({ active: false }))
vi.mock("@nandobfer/integracoes/modules/react/hooks/useIntegrations", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ useIntegration: () => ({ data: { publicValues: { active: builderMachine.active } } }), useIntegrationDetails: (ids: string[]) => ids.map(() => ({ data: { publicValues: { active: builderMachine.active } } })) }))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/react/central/detail/ApiDocsCard", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ ApiDocsCard: () => <div data-testid="api-docs" /> }))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@/features/opex-agent/components/jobs/OpexJobsTab", () => ({ OpexJobsTab: () => <div data-testid="opex-jobs" /> }))

import { opexEditor } from '../../helpers/opex-editors'
const CronsEditorForm = await opexEditor('crons')

const def = getIntegrationDef("crons")!
const data: IntegrationDetailDto = {
    id: "crons",
    name: "Crons",
    description: "Rotinas agendadas",
    environment: "interno",
    debugMode: false,
    publicValues: { schedulerEnabled: true, internalBaseUrl: null, jobs: [] },
    secrets: { cronSecret: { configured: true, source: "db", unreadable: false } },
    encryptionKeyConfigured: true,
    stored: true,
    health: { status: "ok" },
    swaggerUrl: null,
    explorerAuth: null,
    cronStates: [],
}

function renderForm() {
    render(
        <CronsEditorForm
            def={def}
            data={data}
            draft={draftFrom(data)}
            setDraft={vi.fn()}
            dirty={false}
            pending={false}
            onSave={async () => true}
            onUndo={vi.fn()}
            onExplore={vi.fn()}
        />,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    builderMachine.active = false
    window.history.replaceState(null, "", "/integracoes/crons")
})
afterEach(cleanup)

describe("CronsEditorForm", () => {
    it("tem as abas Geral e Rotinas; a lista de rotinas fica em Rotinas", () => {
        renderForm()
        expect(screen.getByRole("tab", { name: "Geral" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Rotinas" })).toBeTruthy()

        expect(screen.getByTestId("api-docs")).toBeTruthy()
        expect(screen.queryByTestId("cron-jobs")).toBeNull()

        fireEvent.click(screen.getByRole("tab", { name: "Rotinas" }))
        expect(screen.getByTestId("cron-jobs")).toBeTruthy()
        expect(screen.queryByTestId("opex-jobs")).toBeNull()
    })

    it("aba Jobs (sempre presente) com os jobs do Agente Opex", () => {
        renderForm()
        fireEvent.click(screen.getByRole("tab", { name: "Jobs" }))
        expect(screen.getByTestId("opex-jobs")).toBeTruthy()
        expect(screen.queryByTestId("api-docs")).toBeNull()
    })

    it("rotina de integração desativada (limpeza da Builder Machine) fica escondida; ativa, aparece", () => {
        renderForm()
        fireEvent.click(screen.getByRole("tab", { name: "Rotinas" }))
        expect(screen.getByTestId("cron-jobs").getAttribute("data-hidden")).toBe("builder-machine-cleanup")
        cleanup()
        builderMachine.active = true
        renderForm()
        fireEvent.click(screen.getByRole("tab", { name: "Rotinas" }))
        expect(screen.getByTestId("cron-jobs").getAttribute("data-hidden")).toBe("")
    })
})
