import { randomBytes } from "node:crypto"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { runAgentTurn } from "@/lib/ai/opencode-run"
import { DomainError } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import type { EnvironmentSettings } from "../schemas"
import { accessDirectoryFor } from "./access-registry"
import { agentBaseUrl } from "./credentials"
import { shellQuote } from "./prompts"

const TTL_MS = 5 * 60_000
const PROBE_TIMEOUT_MS = 5 * 60_000

interface Probe {
    echo: string
    dir: string
    expiresAt: number
    usedAt: number | null
}
const probes = new Map<string, Probe>()

/**
 * Teste de acesso do agente (preflight do módulo). O servidor roda em outro filesystem que o agente,
 * então a única prova de que o caminho funciona é o agente **buscar** o envelope e devolver o valor
 * que só o Opex conhece. Vale para operações e sessões de logs.
 */
export function consumeAccessProbe(token: string): { ok: true } {
    const probe = probes.get(token)
    if (!probe) throw new DomainError(403, "Teste de acesso inválido", "ACCESS_TOKEN_REJECTED")
    if (probe.usedAt !== null) throw new DomainError(409, "Teste de acesso já utilizado", "ACCESS_TOKEN_REJECTED")
    if (probe.expiresAt <= Date.now()) throw new DomainError(410, "Teste de acesso expirado", "ACCESS_TOKEN_EXPIRED")
    probe.usedAt = Date.now()
    return { ok: true }
}

/** Remove testes expirados/consumidos (chamado pelo tick das rotinas). */
export function sweepAccessProbes(now = Date.now()): void {
    for (const [token, probe] of probes) if (probe.expiresAt <= now || probe.usedAt !== null) probes.delete(token)
}

export interface AccessProbeResult {
    ok: boolean
    directory: string
    detail: string
}

export async function runAccessProbe(
    settings: EnvironmentSettings,
    signal?: AbortSignal,
): Promise<AccessProbeResult> {
    if (!settings.enabled)
        throw new DomainError(409, "Ative os agentes de Ambientes antes de testar", "ENVIRONMENT_DISABLED")
    const baseUrl = agentBaseUrl(settings)
    const token = randomBytes(24).toString("base64url")
    const echo = randomBytes(8).toString("hex")
    const dir = accessDirectoryFor(settings.accessDirectory, "probe", token.slice(0, 12))
    probes.set(token, { echo, dir, expiresAt: Date.now() + TTL_MS, usedAt: null })
    const text = [
        "Teste de acesso do Opex: não altere nada no host (nada de Git, Docker, Compose ou banco). Responda em pt-BR e não peça aprovação.",
        `Execute: umask 077 && mkdir -p ${shellQuote(dir)} && chmod 700 ${shellQuote(dir)} && curl -fsS -X POST ${shellQuote(`${baseUrl}/api/environments/agent-access`)} -H 'content-type: application/json' -d ${shellQuote(JSON.stringify({ probe: token }))} -o ${shellQuote(`${dir}/probe.json`)} && chmod 600 ${shellQuote(`${dir}/probe.json`)} (sem curl, use o fetch do node).`,
        'Leia o campo "echo" de probe.json sem imprimir o restante do arquivo e finalize com uma única linha: OPEX_PROBE <valor de echo>.',
        "Se qualquer passo falhar, finalize com OPEX_PROBE FAILED e uma linha explicando o motivo.",
    ].join("\n")
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    const client = await getOpencodeClient()
    const session = await client.session.create({
        title: "Ambientes · teste de acesso do agente",
        location: { directory: settings.sessionDirectory },
        metadata: { app: "opex", kind: "environment-access-probe" },
    })
    try {
        const turn = await runAgentTurn(
            client,
            {
                id: randomBytes(12).toString("hex"),
                sessionId: session.id,
                stage: "environment-access-probe",
                title: "Teste de acesso do agente",
                agent: settings,
                text,
                timeoutMs: PROBE_TIMEOUT_MS,
                signal: controller.signal,
                consumption: { origin: "environments", subject: "teste de acesso do agente" },
            },
            {
                onForm: (form) => client.session.form.cancel({ sessionID: session.id, formID: form.id }),
                onPermission: (permission) =>
                    client.permission.reply({ sessionID: session.id, requestID: permission.id, decision: "reject" }),
            },
        )
        const ok = turn.text.includes(echo)
        logger.info({ ok, directory: dir }, "[environments] Teste de acesso do agente concluído")
        return {
            ok,
            directory: dir,
            detail: ok
                ? `O agente alcançou o Opex e gravou o acesso temporário em ${dir}.`
                : "O agente não comprovou a busca do envelope: confira a URL base do agente, o diretório de acesso e as permissões no host.",
        }
    } finally {
        signal?.removeEventListener("abort", abort)
        probes.delete(token)
        await client.session.remove({ sessionID: session.id }).catch(() => undefined)
    }
}
