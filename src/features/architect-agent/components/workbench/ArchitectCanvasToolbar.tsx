"use client"

import type { ReactNode } from "react"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ARCHITECT_VIEW_LABELS, ARCHITECT_VIEWS, type ArchitectView } from "../../constants"

/**
 * Barra flutuante no canto superior esquerdo do canvas: visão, filtros, exportar, ajustar visão,
 * restaurar layout (e "Acompanhar" ao vivo). Fica fora do viewport transformado do React Flow (não
 * escala com o zoom) e fora do PNG exportado, que só captura o viewport. Quebra linha em telas estreitas.
 */

/** Classes da barra e dos botões (o skeleton usa as mesmas). */
export const ARCHITECT_CANVAS_TOOLBAR_CLASS = "absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1"
export const CANVAS_TOOL_BUTTON_CLASS = "h-7 gap-1.5 bg-card/90 backdrop-blur"

export function ArchitectViewTabs({ view, onViewChange }: { view: ArchitectView; onViewChange: (view: ArchitectView) => void }) {
    return (
        <OptionTabs<ArchitectView>
            id="architect-view"
            aria-label="Visão do diagrama"
            size="xs"
            className="bg-card/90 backdrop-blur"
            options={ARCHITECT_VIEWS.map((value) => ({ value, label: ARCHITECT_VIEW_LABELS[value] }))}
            value={view}
            onChange={onViewChange}
        />
    )
}

export function ArchitectCanvasToolbar({ children }: { children: ReactNode }) {
    return (
        <div className={ARCHITECT_CANVAS_TOOLBAR_CLASS} role="toolbar" aria-label="Controles do diagrama" data-testid="architect-canvas-toolbar">
            {children}
        </div>
    )
}
