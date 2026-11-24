import { AgenticFork, AgenticWorkbench, type IAgenticFork, type IAgenticWorkbench } from "@/lib/db/models/Agentic"

/**
 * Escopo do MCP da mesa (OPE-178): a sessão do OpenCode que chamou (`_meta["ai.opencode/sessionID"]`,
 * subindo até a sessão-mãe quando quem chama é um subagente) precisa ser a sessão ATUAL de uma mesa
 * ou de um fork. O MCP serve só a mesa dona dessa sessão; qualquer outra (inclusive uma sessão antiga já
 * desvinculada da mesa) é recusada.
 */

export interface WorkbenchMcpScope {
    workbench: IAgenticWorkbench
    fork: IAgenticFork | null
}

const MAX_PARENT_DEPTH = 3

async function scopeOf(sessionId: string): Promise<WorkbenchMcpScope | null> {
    const workbench = (await AgenticWorkbench.findOne({ sessionId }).lean()) as IAgenticWorkbench | null
    if (workbench) return { workbench, fork: null }
    const fork = (await AgenticFork.findOne({ sessionId }).lean()) as unknown as IAgenticFork | null
    if (!fork) return null
    const owner = (await AgenticWorkbench.findById(fork.workbenchId).lean()) as IAgenticWorkbench | null
    return owner ? { workbench: owner, fork } : null
}

/** Sessão do OpenCode (ou a sessão-mãe) → mesa e fork; `null` = sessão que não é de uma mesa. */
export async function workbenchScopeOfSession(sessionId: string, parentOf: (sessionId: string) => Promise<string | null>): Promise<WorkbenchMcpScope | null> {
    let current: string | null = sessionId
    for (let depth = 0; current && depth <= MAX_PARENT_DEPTH; depth++) {
        const found = await scopeOf(current)
        if (found) return found
        current = await parentOf(current).catch(() => null)
    }
    return null
}
