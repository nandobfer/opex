import { DevTask } from "@/lib/db/models/DevTask"
import { logger } from "@/lib/logger"

/**
 * OPE-79: o fluxo da mesa passou a ter o estado **herdado** (`agenticFlow: null` = seguir o padrão
 * da central). As tarefas criadas antes desta funcionalidade nunca gravaram o campo (o `preview` era
 * só o padrão lido em memória) e passariam a "herdar" a central, mudando o comportamento que elas já
 * tinham. A migração grava `"preview"` nessas tarefas para **preservar o fluxo antigo**.
 *
 * Tarefas com escolha explícita (mesmo `"preview"`) não são tocadas, e tarefas novas guardam `null`
 * de propósito — o filtro por **campo ausente** (`$exists: false`) não as alcança.
 *
 * Idempotente: depois da primeira execução nenhum documento casa o filtro.
 */
export async function backfillTaskAgenticFlow(): Promise<void> {
    const result = await DevTask.updateMany({ agenticFlow: { $exists: false } }, { $set: { agenticFlow: "preview" } })
    const updated = result.modifiedCount ?? 0
    if (updated) logger.warn({ updated }, "[migration] fluxo da mesa preservado nas tarefas antigas")
}
