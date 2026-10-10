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

/** Abreviação exibida na faixa recolhida: a sigla do projeto ou as três primeiras letras do nome. */
export function centralSigla(central: CentralDto): string {
    return central.sigla || central.projectName.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3) || "PRJ"
}
