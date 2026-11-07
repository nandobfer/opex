import { randomBytes } from "node:crypto"
import { hostname } from "node:os"

/**
 * Identidade deste processo (OPE-147). A prévia do Opex (mesa de trabalho publicada pelo
 * `/desenvolvimento`) usa o MESMO banco do Opex original: as duas publicações (Local e GitHub Action)
 * injetam `OPEX_PREVIEW=1` e `OPEX_PREVIEW_URL` no container. Ver aicontext/modules/agentic-dev.md.
 */

/** Processo único: host, pid e um sufixo aleatório (o pid se repete entre containers). */
export const INSTANCE_ID = `${hostname()}#${process.env.NODE_APP_INSTANCE ?? process.pid}#${randomBytes(3).toString("hex")}`

export const PREVIEW_SCHEDULER_MESSAGE = "Agendador desligado nesta prévia: as rotinas rodam só no Opex original."

/** Este processo é uma prévia do Opex (agendador automático desligado). */
export function isPreviewInstance(): boolean {
    return process.env.OPEX_PREVIEW === "1"
}

/** Endereço da prévia alcançável pelo host (`http://<host>:<porta>`), só numa prévia. */
export function previewBaseUrl(): string | null {
    if (!isPreviewInstance()) return null
    const url = process.env.OPEX_PREVIEW_URL?.trim()
    return url ? url.replace(/\/+$/, "") : null
}
