import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { memoriesSection } from "@/features/ai/memories-prompt"
import { logger } from "@/lib/logger"
import { DEVELOPER_MEMORIES_INSTRUCTIONS_KEY } from "../constants"

/**
 * Memórias do agente desenvolvedor (OPE-97): as globais e as da central viram uma entrada durável de
 * instrução da sessão do OpenCode, regravada a cada turno da mesa e do fork — assim a memória criada,
 * editada ou excluída vale a partir do próximo turno, inclusive numa sessão que já existia ou foi
 * recriada. Sem memórias, a entrada sai da sessão. Se o servidor recusar a gravação, quem chamou
 * prefixa `section` no prompt do turno.
 */

export interface DeveloperMemoriesSync {
    /** `true` quando a sessão já tem as memórias atuais (ou não há memórias). */
    applied: boolean
    /** Seção das memórias para o prompt (vazia sem memórias). */
    section: string
}

export async function syncDeveloperMemories(client: OpencodeClient, sessionId: string, centralId: string): Promise<DeveloperMemoriesSync> {
    // Import sob demanda: mantém o serviço de memórias (banco, Pusher, Resumo de memórias) fora do carregamento do workflow.
    let texts: string[]
    try {
        const { developerMemoryTexts } = await import("@/features/ai/server/agent-memory-service")
        texts = await developerMemoryTexts(centralId)
    } catch (error) {
        // Falha ao ler o banco não derruba o turno: a sessão mantém a última versão gravada.
        logger.warn({ err: error, sessionId, centralId }, "[agentic] não foi possível ler as memórias do agente desenvolvedor; o turno segue com as já gravadas na sessão")
        return { applied: true, section: "" }
    }
    const section = memoriesSection(texts).trim()
    if (!section) {
        try {
            await client.session.instructions.entry.remove({ sessionID: sessionId, key: DEVELOPER_MEMORIES_INSTRUCTIONS_KEY })
        } catch {
            // Sessão sem a entrada (ou servidor sem suporte): nada a remover.
        }
        return { applied: true, section: "" }
    }
    try {
        await client.session.instructions.entry.put({ sessionID: sessionId, key: DEVELOPER_MEMORIES_INSTRUCTIONS_KEY, value: section })
        return { applied: true, section }
    } catch (error) {
        logger.warn({ err: error, sessionId, centralId }, "[agentic] não foi possível gravar as memórias do agente desenvolvedor na sessão; vão no prompt do turno")
        return { applied: false, section }
    }
}

/** Prompt do turno com as memórias à frente quando a sessão não as recebeu como instrução. */
export function withDeveloperMemories(sync: DeveloperMemoriesSync, text: string): string {
    return sync.applied || !sync.section ? text : `${sync.section}\n\n---\n${text}`
}
