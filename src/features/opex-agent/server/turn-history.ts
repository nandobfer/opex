import type { ModelMessage } from "ai"
import { Types } from "mongoose"
import { OpexMessage, type IOpexMessage } from "@/lib/db/models/Opex"
import type { OpexProviderId } from "../constants"
import { opencodeGoFileKinds, type OpexFileKind } from "../files"
import { selectHistory, stripPastReasoning, withTurnContext } from "../history"
import { resolveFileMarkers } from "./files"
import { nowContext } from "./tools/context"

/**
 * Histórico do modelo de uma sessão (Agente Opex e conversa com um agente rotineiro, OPE-160): os turnos
 * que cabem no orçamento, sem o raciocínio passado e com os arquivos no formato do provedor.
 */

/** Tipos de arquivo que o modelo lê: no OpenCode Go vêm do catálogo (por modelo); nos demais, do provedor. */
async function acceptedFileKinds(provider: OpexProviderId, model: string, signal?: AbortSignal): Promise<ReadonlySet<OpexFileKind> | undefined> {
    if (provider !== "opencode-go") return undefined
    const { opencodeGoModelInputs } = await import("@/lib/ai/opencode-go")
    return opencodeGoFileKinds(await opencodeGoModelInputs(model, signal))
}

export function turnContext(notices: readonly string[] = []): string {
    const now = nowContext()
    return [`Contexto do turno: agora é ${now.local} (${now.timeZone}; ${now.iso}).`, ...notices].join(" ")
}

export function parseModelMessages(json: string): unknown[] {
    try {
        const parsed: unknown = JSON.parse(json)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export interface LoadHistoryOptions {
    notices?: readonly string[]
    signal?: AbortSignal
    /**
     * Acrescenta a data e a hora (e os avisos) ao fim da última mensagem do usuário. Padrão: sim. A
     * conversa com um agente rotineiro não acrescenta nada além do que o dono digitou (OPE-160).
     */
    turnContext?: boolean
}

export async function loadSessionHistory(sessionId: string, summary: string, provider: OpexProviderId, model: string, options: LoadHistoryOptions = {}): Promise<ModelMessage[]> {
    const stored = await OpexMessage.find({ sessionId: new Types.ObjectId(sessionId) }).sort({ seq: 1 }).select({ role: 1, modelMessages: 1 }).lean<Pick<IOpexMessage, "role" | "modelMessages">[]>()
    const turns = stored.map((item) => ({ role: item.role, modelMessages: parseModelMessages(item.modelMessages) }))
    // Os arquivos entram só nos turnos que couberam no orçamento, no formato que o provedor atual lê.
    const messages = await resolveFileMarkers(stripPastReasoning(selectHistory(turns, summary).messages), provider, await acceptedFileKinds(provider, model, options.signal))
    if (options.turnContext === false) return messages as ModelMessage[]
    // A data e a hora do turno vão só no envio, ao fim da mensagem do usuário, para o prompt de sistema não mudar.
    return withTurnContext(messages, turnContext(options.notices ?? [])) as ModelMessage[]
}
