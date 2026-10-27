import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { updateIntegration } from "@/features/integrations/services/integration-service"
import { fingerprintCommand, importKeyCommand, keyPresentCommand, keygenCommand, parseFingerprint, publicKeyOf } from "../commands"
import { LOCAL_DOCKER_AUDIT_ENTITY, LOCAL_DOCKER_INTEGRATION_ID } from "../constants"
import type { LocalDockerKeyAction } from "../schemas"
import type { LocalDockerSettingsDto } from "../types"
import { LocalDockerState, localDockerDb } from "./models"
import { getLocalDockerSettings, loadState, localDockerLog, publishLocalDocker } from "./settings"
import { builderDebug, lastLine, runOnHost, type HostRunner } from "./shell"

/**
 * Chave do servidor para entrar no PC. **Gerar**: criada no host (a privada nunca sai de lá).
 * **Inserir existente**: a privada colada fica cifrada como segredo da integração e é gravada no host
 * (regravada se o host for refeito). A tela nunca recebe a chave, só a impressão digital.
 */

const PRIVATE_KEY_SECRET = "sshPrivateKey"

async function fingerprint(run: HostRunner): Promise<string | null> {
    const result = await run(fingerprintCommand(), 10_000)
    return result.exitCode === 0 ? parseFingerprint(result.output) : null
}

export async function setServerKey(input: LocalDockerKeyAction, actorId: string, run: HostRunner = runOnHost): Promise<LocalDockerSettingsDto> {
    const before = await loadState()
    const result = input.action === "generate" ? await run(keygenCommand(), 20_000) : await run(importKeyCommand(input.privateKey), 20_000, { redactedAs: "(gravando a chave privada inserida no host)" })
    const publicKey = publicKeyOf(result.output)
    if (result.exitCode !== 0 || !publicKey) {
        const reason = lastLine(result.output)
        throw new DomainError(input.action === "import" ? 400 : 502, `${input.action === "import" ? "Não foi possível usar a chave inserida" : "Não foi possível gerar a chave no servidor"}${reason ? `: ${reason}` : ""}`, "LOCAL_DOCKER_KEY_FAILED")
    }
    // Chave importada: a privada fica cifrada na integração; gerada: nada de privada fora do host.
    await updateIntegration(LOCAL_DOCKER_INTEGRATION_ID, { secrets: { [PRIVATE_KEY_SECRET]: input.action === "import" ? { action: "set", value: input.privateKey.trim() } : { action: "clear" } } }, actorId)
    const print = await fingerprint(run)
    await localDockerDb()
    const source = input.action === "import" ? "imported" : "generated"
    await LocalDockerState.updateOne({ key: "default" }, { $set: { publicKey, keySource: source, keyFingerprint: print, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: LOCAL_DOCKER_AUDIT_ENTITY,
        entidadeId: "chave",
        acao: before?.publicKey ? AcaoAuditoria.ATUALIZAR : AcaoAuditoria.CRIAR,
        antes: before?.publicKey ? { origem: before.keySource ?? "generated", impressaoDigital: before.keyFingerprint } : undefined,
        depois: { origem: source, impressaoDigital: print },
    })
    builderDebug.success(`Chave do servidor ${source === "imported" ? "inserida" : "gerada"}${print ? `: ${print}` : ""}`)
    localDockerLog.info({ source }, "[local-docker] Chave do servidor trocada")
    await publishLocalDocker("settings")
    return getLocalDockerSettings()
}

/** Chave importada que sumiu do host (host refeito): grava de novo a partir do segredo. */
export async function ensureKeyOnHost(run: HostRunner = runOnHost): Promise<void> {
    const state = await loadState()
    if (state?.keySource !== "imported") return
    if ((await run(keyPresentCommand(), 10_000)).exitCode === 0) return
    const { sshPrivateKey } = await getIntegrationConfig(LOCAL_DOCKER_INTEGRATION_ID)
    if (!sshPrivateKey) throw new DomainError(409, "A chave inserida não está mais disponível: insira ou gere a chave de novo na aba Preparo do PC", "LOCAL_DOCKER_NO_KEY")
    const result = await run(importKeyCommand(sshPrivateKey), 20_000, { redactedAs: "(regravando no host a chave privada inserida)" })
    if (result.exitCode !== 0) throw new DomainError(502, `Não foi possível regravar a chave no host${lastLine(result.output) ? `: ${lastLine(result.output)}` : ""}`, "LOCAL_DOCKER_KEY_FAILED")
    localDockerLog.info("[local-docker] Chave inserida regravada no host")
}
