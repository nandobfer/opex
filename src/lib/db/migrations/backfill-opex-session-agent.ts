import { OpexSession } from "@/lib/db/models/Opex"

/**
 * Agente Maddox (OPE-101): as sessões antigas são do Agente Opex. Preenche `agent: "opex"` onde falta e
 * cria os índices novos (por agente e pela sessão do OpenCode). Idempotente; as consultas também tratam
 * a ausência do campo como Agente Opex.
 */
export async function backfillOpexSessionAgent(): Promise<void> {
    await OpexSession.updateMany({ agent: { $exists: false } }, { $set: { agent: "opex" } })
    await OpexSession.createIndexes()
}
