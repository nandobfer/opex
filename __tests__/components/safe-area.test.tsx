/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ usePathname: () => "/tarefas" }))
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))
vi.mock("@/lib/pusher/RealtimeStatusBanner", () => ({ RealtimeStatusBanner: () => null }))
vi.mock("@/features/agentic/hooks/useAgentic", () => ({ useTestCentral: () => ({ mutateAsync: vi.fn() }) }))
vi.mock("@nandobfer/integracoes/react", () => ({
    IntegrationDebugConsole: ({ onMaximizedChange }: { onMaximizedChange: (value: boolean) => void }) => (
        <button type="button" onClick={() => onMaximizedChange(true)}>
            Maximizar
        </button>
    ),
}))

import { AppShell } from "@/features/layout/components/AppShell"
import { APP_NAV } from "@/features/layout/navigation"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { TaskBulkBar } from "@/features/tasks/components/TaskBulkBar"
import { CentralLogsSection } from "@/features/agentic/components/central/CentralLogsSection"
import { MessageFiles } from "@/components/chat-attachments/MessageFiles"
import type { TaskDto } from "@/features/tasks/types"

/**
 * Safe areas do app instalado (PWA, OPE-196): as camadas que encostam nas bordas reservam os insets do
 * aparelho (notch e barra de gestos). Sem estas classes, o conteúdo volta a ficar embaixo das barras do
 * sistema sem nenhum outro teste acusar.
 */
const insets = (element: Element) => element.className.match(/env\(safe-area-inset-(top|right|bottom|left)\)/g) ?? []
const hasInset = (element: Element, side: "top" | "right" | "bottom" | "left") => insets(element).includes(`env(safe-area-inset-${side})`)

afterEach(cleanup)

describe("safe areas do app instalado", () => {
    beforeEach(() => {
        window.innerWidth = 500
    })

    it("a raiz da casca reserva os quatro lados e a gaveta do celular, topo e base", () => {
        render(
            <AppShell brand={{ name: "Acme", homeHref: "/tarefas" }} sections={APP_NAV} navLabel="Menu principal" ownerName="Ana">
                <p>conteúdo</p>
            </AppShell>,
        )
        const root = document.getElementById("main-content")!.closest(".h-dvh")!
        for (const side of ["top", "right", "bottom", "left"] as const) expect(hasInset(root, side)).toBe(true)

        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        const drawer = screen.getByRole("dialog", { name: "Menu principal" })
        expect(hasInset(drawer, "top")).toBe(true)
        expect(hasInset(drawer, "bottom")).toBe(true)
    })

    it("a folha (só de baixo, OPE-208) mantém o inset inferior e o limite de altura mesmo quando o chamador troca o padding", () => {
        for (const className of [undefined, "p-0", "p-4 pb-2 pt-2"]) {
            render(
                <Sheet open>
                    <SheetContent className={className} aria-describedby={undefined}>
                        <SheetTitle>Folha</SheetTitle>
                    </SheetContent>
                </Sheet>,
            )
            const content = screen.getByRole("dialog")
            expect(hasInset(content, "bottom")).toBe(true)
            expect(content.className).toContain("max-h-[85dvh]")
            expect(content.className).toContain("overflow-y-auto")
            // Nenhuma gaveta lateral ou de cima: a folha encosta só no pé da tela.
            expect(content.className).toContain("bottom-0")
            expect(content.className).not.toMatch(/(^|\s)(inset-y-0|left-0|right-0|top-0)(\s|$)/)
            cleanup()
        }
    })

    it("a barra de lote das Tarefas fica acima da barra de gestos", () => {
        const task = { id: "1", code: "OPX-1", columnId: "todo", order: 1, title: "Tarefa", taskType: "feature", priority: "medium", archived: false, project: null, createdAt: null, updatedAt: null } as TaskDto
        render(<TaskBulkBar tasks={[task]} columns={[]} progress={null} onMove={vi.fn()} onPriority={vi.fn()} onArchive={vi.fn()} onClear={vi.fn()} />)
        const bar = screen.getByRole("toolbar", { name: "Ações das tarefas selecionadas" })
        const floating = bar.closest("[class*='safe-area-inset-bottom']")
        expect(floating).not.toBeNull()
        expect(floating!.className).toContain("bottom-[calc(1.5rem+env(safe-area-inset-bottom))]")
    })

    it("os logs maximizados da central respeitam os quatro insets", () => {
        render(<CentralLogsSection centralId="c1" />)
        fireEvent.click(screen.getByRole("button", { name: "Maximizar" }))
        const card = screen.getByRole("button", { name: "Maximizar" }).closest(".fixed")!
        for (const side of ["top", "right", "bottom", "left"] as const) expect(hasInset(card, side)).toBe(true)
    })

    it("a imagem ampliada do chat respeita os quatro insets", () => {
        render(<MessageFiles files={[{ id: "f1", name: "foto.png", mediaType: "image/png", size: 10, kind: "image", url: "/api/files/f1" }]} />)
        fireEvent.click(screen.getByRole("button", { name: "Ampliar foto.png" }))
        const zoom = screen.getByRole("dialog")
        for (const side of ["top", "right", "bottom", "left"] as const) expect(hasInset(zoom, side)).toBe(true)
    })
})
