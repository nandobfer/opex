import { z } from "zod"

/** Colunas recolhidas da Central de desenvolvimento (persistidas no navegador). */

export const DEV_CENTER_LAYOUT_KEY = "opex:dev-center-layout:v1"

export const devCenterLayoutSchema = z.object({
    centralsCollapsed: z.boolean(),
    tasksCollapsed: z.boolean(),
})
export type DevCenterLayout = z.infer<typeof devCenterLayoutSchema>

export const DEFAULT_DEV_CENTER_LAYOUT: DevCenterLayout = { centralsCollapsed: false, tasksCollapsed: false }

/** Larguras das colunas (px) abertas e recolhidas (faixa estreita). */
export const PANE_WIDTHS = { centrals: 220, tasks: 340, rail: 48 } as const
