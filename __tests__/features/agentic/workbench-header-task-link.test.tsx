/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { CentralDto, WorkbenchDto } from "@/features/agentic/types"

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }))
vi.mock("@/features/agentic/hooks/useAgentic", () => ({ useDeleteWorkbench: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock("@/features/agentic/components/WorkbenchStageBadge", () => ({ WorkbenchStageBadge: () => null }))
vi.mock("@/features/agentic/components/workbench/WorkbenchStageMenu", () => ({ WorkbenchStageMenu: () => null }))
vi.mock("@/features/agentic/components/workbench/ForkStatusBadge", () => ({ ForksOpenBadge: () => null }))

import { WorkbenchHeader } from "@/features/agentic/components/workbench/WorkbenchHeader"

const ID = "a".repeat(24)
const workbench = (patch: Partial<WorkbenchDto>) =>
    ({
        id: "w1",
        taskId: ID,
        taskCode: "OPE-12",
        taskTitle: "Rodapé",
        stage: "planning",
        runState: "idle",
        branch: null,
        worktreePath: null,
        sessionDirectory: null,
        port: null,
        pr: null,
        previewUrl: null,
        deletionRequestedAt: null,
        usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, costUsd: 0 },
        ...patch,
    }) as unknown as WorkbenchDto
const central = { id: "c1", projectName: "opex" } as unknown as CentralDto

afterEach(cleanup)

describe("WorkbenchHeader — link da tarefa (OPE-146)", () => {
    it("o código da tarefa leva a /tarefas/<código em minúsculas>", () => {
        render(<WorkbenchHeader workbench={workbench({})} central={central} connected />)
        expect(screen.getByRole("link", { name: "OPE-12" }).getAttribute("href")).toBe("/tarefas/ope-12")
    })

    it("sem código, o link cai no id (a página redireciona para o código)", () => {
        render(<WorkbenchHeader workbench={workbench({ taskCode: "" })} central={central} connected />)
        const link = document.querySelector(`a[href="/tarefas/${ID}"]`)
        expect(link).toBeTruthy()
    })
})
