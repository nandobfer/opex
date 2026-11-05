import { shellQuote } from "@/features/agentic/preview-backup"
import { ROUTINE_WORKDIR_ROOT } from "../constants"

/**
 * Pasta de trabalho do agente rotineiro no host (motor OpenCode, OPE-130): `~/opex-rotineiros/<slug>`
 * no usuário do OpenCode, persistente entre execuções. Criada pelo OpenCode (servidor e host não
 * compartilham disco); apagada no host, é recriada na próxima execução.
 */
export async function ensureRoutineWorkdir(slug: string): Promise<string> {
    const { openHost, runOrFail } = await import("@/features/opencode-resources/server/host")
    const host = await openHost()
    const directory = `${host.home.replace(/\/+$/, "")}/${ROUTINE_WORKDIR_ROOT}/${slug}`
    await runOrFail(host, `mkdir -p ${shellQuote(directory)} && test -w ${shellQuote(directory)}`, "Não foi possível criar a pasta do agente rotineiro no host do OpenCode")
    return directory
}
