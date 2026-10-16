import { z } from "zod"
import type { CentralDto } from "./types"

/**
 * Central selecionada na Central de desenvolvimento, persistida no navegador (não na URL). A chave
 * é versionada; dado corrompido ou de versão antiga volta ao padrão.
 */

export const DEV_CENTER_CENTRAL_KEY = "opex:dev-center-central:v1"

export const devCenterCentralSchema = z.object({ id: z.string() })
export type DevCenterCentral = z.infer<typeof devCenterCentralSchema>

export const DEFAULT_DEV_CENTER_CENTRAL: DevCenterCentral = { id: "" }

/** Valor salvo quando o seletor está em "Todos os projetos" (tarefas de todas as centrais). */
export const ALL_CENTRALS_ID = "all"

export const isAllCentrals = (storedId: string): boolean => storedId === ALL_CENTRALS_ID

/**
 * Central efetiva da tela: a do projeto da tarefa aberta (quando houver), senão a salva (se ainda
 * existir), senão a primeira. `null` quando não há centrais.
 */
export function pickActiveCentral(centrals: readonly CentralDto[], storedId: string, taskProjectId: string | null): CentralDto | null {
    if (taskProjectId) {
        const fromTask = centrals.find((central) => central.projectId === taskProjectId)
        if (fromTask) return fromTask
    }
    return centrals.find((central) => central.id === storedId) ?? centrals[0] ?? null
}
