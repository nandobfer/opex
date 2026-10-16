import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { AgenticWorkbench, type IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { logger } from "@/lib/logger"
import { FORK_NOTES_INSTRUCTIONS_KEY } from "../constants"
import { forkNotesInstructions } from "../fork-logic"

/**
 * Resumos de forks integrados ao contexto da conversa principal: gravados na mesa (`forkNotes`) e
 * aplicados como entrada durável de instrução da sessão da mesa. Sem suporte do servidor (ou com a
 * sessão recriada), `forkNotesSynced = false` e os resumos vão no próximo prompt da mesa.
 */

/** Grava os resumos como instrução durável da sessão; devolve `true` em caso de sucesso. */
export async function applyForkNotes(client: OpencodeClient, workbench: Pick<IAgenticWorkbench, "_id" | "forkNotes">, sessionId: string): Promise<boolean> {
    const notes = workbench.forkNotes ?? []
    if (!notes.length) return true
    try {
        await client.session.instructions.entry.put({ sessionID: sessionId, key: FORK_NOTES_INSTRUCTIONS_KEY, value: forkNotesInstructions(notes) })
        await AgenticWorkbench.updateOne({ _id: workbench._id }, { $set: { forkNotesSynced: true } })
        return true
    } catch (error) {
        logger.warn({ err: error, workbenchId: String(workbench._id), sessionId }, "[agentic-fork] não foi possível aplicar os resumos dos forks à sessão; vão no próximo prompt")
        await AgenticWorkbench.updateOne({ _id: workbench._id }, { $set: { forkNotesSynced: false } })
        return false
    }
}

/**
 * Prompt do próximo turno da mesa: com resumos ainda não sincronizados na sessão, os prefixa (uma
 * vez — depois disso estão no histórico da conversa).
 */
export async function withUnsyncedForkNotes(workbench: Pick<IAgenticWorkbench, "_id" | "forkNotes" | "forkNotesSynced">, text: string): Promise<string> {
    const notes = workbench.forkNotes ?? []
    if (!notes.length || workbench.forkNotesSynced !== false) return text
    await AgenticWorkbench.updateOne({ _id: workbench._id }, { $set: { forkNotesSynced: true } })
    return `${forkNotesInstructions(notes)}\n\n---\n${text}`
}
