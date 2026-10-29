import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { builderEnsureCommand, builderLimitsOf, connectionProblem, listContainersCommand, networkCommand, parseContainers, planAliasReconcile, remoteCommand, sameLimits } from "../commands"
import { LOCAL_DOCKER_AUDIT_ENTITY } from "../constants"
import type { LocalDockerMachineAction, LocalDockerSettings } from "../schemas"
import type { LocalDockerMachineResultDto, LocalDockerStepDto } from "../types"
import { CERTIFICATES_STEP_LABEL, certificatesStep } from "./certificates"
import { ensureKeyOnHost } from "./key"
import { LocalDockerState, localDockerDb } from "./models"
import { loadState, localDockerLog, publishLocalDocker, settingsOf } from "./settings"
import { builderDebug, lastLine, runOnHost, type HostRunner } from "./shell"
import { isTunnelOpen, machineInfo } from "./tunnel"

/** Ações da Builder Machine: testar a conexão e preparar (reconciliar) a infra do Docker do PC. */

const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`

/** Passos do teste de conexão (também usados pelo tester da integração). */
export async function testSteps(settings: LocalDockerSettings, run: HostRunner = runOnHost): Promise<LocalDockerStepDto[]> {
    await ensureKeyOnHost(run)
    const ssh = await run(remoteCommand(settings, "docker version --format '{{.Server.Version}}'"), 20_000)
    const steps: LocalDockerStepDto[] = [
        {
            label: settings.mode === "reverse" ? `SSH do PC pelo túnel de controle (porta ${settings.controlPort})` : `SSH do PC em ${settings.pcHost}:${settings.pcSshPort}`,
            ok: ssh.exitCode === 0,
            detail: ssh.exitCode === 0 ? `Docker ${lastLine(ssh.output)} no PC` : lastLine(ssh.output) || "Sem resposta",
        },
    ]
    if (!(await isTunnelOpen(run))) {
        steps.push({ label: "Túnel do Docker", ok: true, detail: "Fechado (as prévias vão para o servidor)" })
        return steps
    }
    const info = await machineInfo(settings, run)
    steps.push({ label: `Docker do PC (contexto ${settings.contextName})`, ok: Boolean(info), detail: info ? `${info.name}: Docker ${info.version}, ${info.cpus} CPUs, ${gib(info.memoryBytes)}` : "O Docker do PC não respondeu pelo túnel" })
    return steps
}

async function runStep(label: string, command: string, run: HostRunner, timeoutMs = 180_000): Promise<LocalDockerStepDto> {
    const result = await run(command, timeoutMs)
    const ok = result.exitCode === 0
    return { label, ok, detail: ok ? lastLine(result.output) || "OK" : lastLine(result.output) || "Falhou" }
}

/**
 * Reconcilia a infra do PC por diferença — só os containers de ambiente (labels do preparo) são
 * tocados; as prévias nunca. Rede, apelidos novos/alterados/removidos, o builder (recriado mantendo o
 * cache só quando os limites mudaram; `forceBuilder` recria de qualquer jeito) e, por último, o
 * diagnóstico de inspeção TLS (certificados do PC).
 */
export async function reconcileEnvironment(settings: LocalDockerSettings, run: HostRunner = runOnHost, options: { forceBuilder?: boolean } = {}): Promise<LocalDockerStepDto[]> {
    const steps: LocalDockerStepDto[] = []
    const network = await runStep(`Rede ${settings.network}`, networkCommand(settings), run)
    steps.push(network.ok ? { ...network, detail: "Pronto" } : network)
    if (!network.ok) return steps

    const listed = await run(listContainersCommand(settings), 30_000)
    if (listed.exitCode !== 0) return [...steps, { label: "Containers do PC", ok: false, detail: lastLine(listed.output) || "O Docker do PC não respondeu" }]
    for (const item of planAliasReconcile(settings, parseContainers(listed.output))) {
        if (!item.command) {
            steps.push({ label: item.label, ok: true, detail: "Sem mudança" })
            continue
        }
        const step = await runStep(item.label, item.command, run)
        steps.push({ ...step, detail: step.ok ? { start: "Levantado", create: "Criado", remove: "Removido", keep: "Sem mudança" }[item.kind] : step.detail })
        if (!step.ok) return steps
    }

    const state = await loadState()
    const limits = builderLimitsOf(settings)
    // Sem registro = builder antigo, criado sem limites.
    const recreate = Boolean(options.forceBuilder) || !sameLimits(state?.builderApplied ?? { memoryGb: null, cpus: null }, limits)
    const builder = await runStep(`Builder ${settings.builderName}${recreate ? " (recriado, cache mantido)" : ""}`, builderEnsureCommand(settings, recreate), run)
    steps.push(builder.ok ? { ...builder, detail: recreate ? "Recriado com os limites atuais" : "Pronto" } : builder)
    if (builder.ok) await LocalDockerState.updateOne({ key: "default" }, { $set: { builderApplied: limits } }, { upsert: true })
    steps.push(await certificatesStep(settings, run))
    return steps
}

async function savePrepare(steps: LocalDockerStepDto[], trigger: "manual" | "save"): Promise<boolean> {
    const ok = steps.length > 0 && steps.every((step) => step.ok)
    await localDockerDb()
    await LocalDockerState.updateOne({ key: "default" }, { $set: { lastPrepare: { ok, trigger, steps, at: new Date() } } }, { upsert: true })
    return ok
}

export async function runMachineAction(action: LocalDockerMachineAction, actorId: string, run: HostRunner = runOnHost): Promise<LocalDockerMachineResultDto> {
    const { settings } = settingsOf(await loadState())
    const problem = connectionProblem(settings)
    if (problem) throw new DomainError(400, problem, "LOCAL_DOCKER_INCOMPLETE")
    if (action === "test") {
        const steps = await testSteps(settings, run)
        return { action, ok: steps.every((step) => step.ok), steps }
    }
    if (!(await isTunnelOpen(run))) throw new DomainError(409, "Abra o túnel antes de usar o Docker do PC", "LOCAL_DOCKER_TUNNEL_CLOSED")
    if (settings.aliases.length > 0 && !settings.serverAddress) {
        throw new DomainError(400, "Informe o endereço do servidor visto pelo PC (destino dos apelidos de rede)", "LOCAL_DOCKER_NO_SERVER_ADDRESS")
    }
    const steps = await reconcileEnvironment(settings, run)
    const ok = await savePrepare(steps, "manual")
    await recordAudit({ userId: actorId, entidade: LOCAL_DOCKER_AUDIT_ENTITY, entidadeId: "preparo", acao: AcaoAuditoria.ATUALIZAR, depois: { ok, passos: steps.map((step) => `${step.ok ? "ok" : "falhou"}: ${step.label}`) } })
    localDockerLog.info({ action, ok }, "[local-docker] Preparo do Docker do PC")
    builderDebug[ok ? "success" : "warn"](`Preparo do Docker do PC: ${ok ? "concluído" : "falhou"}`)
    await publishLocalDocker("containers")
    await publishLocalDocker("settings")
    return { action, ok, steps }
}

/**
 * Depois de salvar a configuração: com o túnel aberto e o PC já preparado uma vez, aplica só a
 * diferença (apelido novo levanta sozinho, sem mexer nos outros). Túnel fechado: nada a fazer.
 */
export async function reconcileAfterSave(actorId: string, run: HostRunner = runOnHost): Promise<void> {
    const state = await loadState()
    if (!state?.lastPrepare) return
    const { settings } = settingsOf(state)
    if (connectionProblem(settings) || (settings.aliases.length > 0 && !settings.serverAddress)) return
    if (!(await isTunnelOpen(run))) return
    const steps = await reconcileEnvironment(settings, run)
    const ok = await savePrepare(steps, "save")
    // O diagnóstico dos certificados só mede (não muda nada no PC): entra na auditoria só quando falha.
    const changed = steps.filter((step) => step.detail !== "Sem mudança" && step.detail !== "Pronto" && !(step.label === CERTIFICATES_STEP_LABEL && step.ok))
    if (changed.length > 0) {
        await recordAudit({ userId: actorId, entidade: LOCAL_DOCKER_AUDIT_ENTITY, entidadeId: "preparo", acao: AcaoAuditoria.ATUALIZAR, depois: { automatico: true, ok, passos: changed.map((step) => `${step.ok ? "ok" : "falhou"}: ${step.label}`) } })
    }
    localDockerLog.info({ ok, changed: changed.length }, "[local-docker] Configuração aplicada no PC")
    await publishLocalDocker("containers")
    await publishLocalDocker("settings")
}
