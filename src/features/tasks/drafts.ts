import { isCustomColumnKey } from "./board"
import type { TaskStatus } from "./constants"

/**
 * Rascunhos (issues do GitHub ainda não enviadas ao Go! Sipal) aparecem no quadro como tarefas com
 * id `draft-{id}` e `draft` preenchido. Ficam só em colunas pessoais; soltar numa coluna do Go!
 * Sipal pede confirmação e envia. Módulo PURO.
 */

export const DRAFT_ID_PREFIX = "draft-"
export const DRAFT_TASK_ID = /^draft-[a-f0-9]{24}$/i

export const isDraftTaskId = (id: string | null | undefined): boolean => typeof id === "string" && DRAFT_TASK_ID.test(id)
export const draftTaskId = (mongoId: string) => `${DRAFT_ID_PREFIX}${mongoId}`
export const draftMongoId = (taskId: string) => taskId.slice(DRAFT_ID_PREFIX.length)

/** Colunas do Go! Sipal em que a plataforma aceita criar tarefa. */
export const DRAFT_SENDABLE_STATUSES: readonly TaskStatus[] = ["backlog", "prioritized", "specification", "development"]

/** O rascunho pode ir para esta coluna? (pessoal: move; Go! Sipal criável: envia). */
export function draftAcceptsColumn(key: string): boolean {
    return isCustomColumnKey(key) || DRAFT_SENDABLE_STATUSES.includes(key as TaskStatus)
}

export const DRAFT_BLOCKED_MESSAGE = "Rascunhos só podem ser enviados para Backlog, Priorizado, Especificação ou Desenvolvimento"
