import { AgentFile } from "@/lib/db/models/AgentFile"

/** Índices do catálogo dos arquivos dos agentes (OPE-210, `agent_files`). Idempotente em cada boot. */
export async function ensureAgentFileIndexes(): Promise<void> {
    await AgentFile.createIndexes()
}
