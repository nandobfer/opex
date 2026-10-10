import { z } from "zod"

/** Coluna de tarefas recolhida da Central de desenvolvimento (persistida no navegador). */

export const DEV_CENTER_LAYOUT_KEY = "opex:dev-center-layout:v2"

export const devCenterLayoutSchema = z.object({
    tasksCollapsed: z.boolean(),
})
export type DevCenterLayout = z.infer<typeof devCenterLayoutSchema>

export const DEFAULT_DEV_CENTER_LAYOUT: DevCenterLayout = { tasksCollapsed: false }

/** Larguras da coluna de tarefas (px): aberta e recolhida (faixa estreita). */
export const PANE_WIDTHS = { tasks: 340, rail: 72 } as const
