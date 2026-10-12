import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { User } from "@/lib/db/models/User"
import { logger } from "@/lib/logger"
import { usernameFromName } from "@/features/orcamentos/logic"
import { uniqueUsername } from "@/features/orcamentos/server/users"

/**
 * Cria o **usuário padrão** de cada cliente de Orçamentos que ainda não tem um (OPE-51). O padrão é
 * admin, sem email/senha, e entra pelo **token do cliente** (a URL do cliente) — preservando os links
 * já enviados. Idempotente: só age em clientes sem `defaultForClientId` correspondente.
 *
 * Roda como migração no `dbConnect()` (não chama `dbConnect` de novo, para não travar o registro).
 */
export async function backfillClientUsers(): Promise<void> {
    const clients = await OrcamentoClient.find().select({ name: 1 }).lean()
    let created = 0
    for (const client of clients) {
        const clientId = String(client._id)
        if (await User.exists({ defaultForClientId: clientId })) continue
        const username = await uniqueUsername(usernameFromName(client.name))
        await User.create({
            username,
            email: null,
            passwordHash: null,
            memberships: [{ clientId, admin: true }],
            token: null,
            tokenHash: null,
            tokenPrefix: null,
            defaultForClientId: clientId,
            active: true,
        })
        created += 1
    }
    if (created) logger.warn({ created }, "[migration] usuários padrão dos clientes criados")
}
