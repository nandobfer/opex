import { getIntegrationConfig, getInternalBaseUrl } from "@/lib/integrations/config"
import { GITHUB_DEFAULT_API_URL, type IntegrationId } from "@/lib/integrations/catalog"
import { describeSchedule } from "@/lib/integrations/schedule"
import { CronJobState } from "@/lib/db/models/CronJobState"
import { ApiToken } from "@/lib/db/models/ApiToken"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { dbConnect } from "@/lib/db"
import { getRawPusherServer } from "@/lib/pusher/server"
import { PUBLIC_API_SPEC_PATH } from "@/lib/public-api/paths"
import { testAiHub, testGemini, testJev, testOpencode } from "@/features/ai/server/testers"
import { describeFetchError, fail, stepSignal, warnResult, type IntegrationTester } from "./types"

// ---------------------------------------------------------------------------
// Pusher: GET /channels
// ---------------------------------------------------------------------------

const testPusher: IntegrationTester = async ({ emit }) => {
    const pusherConfig = await getIntegrationConfig("pusher")
    const target = pusherConfig.mode === "host" ? `host próprio ${pusherConfig.url ?? ""}`.trim() : `cluster ${pusherConfig.cluster}`
    emit("step", `Autenticando na API REST do Pusher (GET /channels, ${target})`)
    let client: Awaited<ReturnType<typeof getRawPusherServer>>
    try {
        client = await getRawPusherServer()
    } catch (error) {
        fail(describeFetchError(error))
    }
    const res = await client.get({ path: "/channels" }).catch((error: unknown) => fail(`Pusher recusou: ${describeFetchError(error)}`))
    if (!res.ok) fail(`Pusher respondeu HTTP ${res.status}`)
    const body = (await res.json().catch(() => ({}))) as { channels?: Record<string, unknown> }
    const count = Object.keys(body.channels ?? {}).length
    emit("success", `Pusher respondeu HTTP ${res.status}; ${count} canal(is) ocupado(s)`)
    return "Credenciais do Pusher válidas"
}

// ---------------------------------------------------------------------------
// API interna: especificação pública + tokens de sistema ativos
// ---------------------------------------------------------------------------

const testInternalApi: IntegrationTester = async ({ emit, signal }) => {
    const url = `${await getInternalBaseUrl()}${PUBLIC_API_SPEC_PATH}`
    emit("step", `GET ${url}`)
    let res: Response
    try {
        res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: stepSignal(signal, 20_000) })
    } catch (error) {
        fail(`Não foi possível chamar a própria API: ${describeFetchError(error)}`)
    }
    if (!res.ok) fail(`A especificação respondeu HTTP ${res.status}`)
    const spec = (await res.json().catch(() => null)) as { openapi?: string; paths?: Record<string, unknown> } | null
    if (!spec?.openapi?.startsWith("3.")) fail("A resposta não é uma especificação OpenAPI 3.x")
    emit("success", `Especificação OpenAPI ${spec.openapi} com ${Object.keys(spec.paths ?? {}).length} caminho(s)`)

    await dbConnect()
    const tokens = await ApiToken.countDocuments({ revogadoEm: null })
    emit(tokens > 0 ? "success" : "info", tokens > 0 ? `${tokens} token(s) de sistema ativo(s)` : "Nenhum token de sistema ativo: os endpoints públicos recusarão toda chamada")
    return "API interna documentada e protegida por token"
}

// ---------------------------------------------------------------------------
// Crons: segredo + estado do agendador
// ---------------------------------------------------------------------------

const testCrons: IntegrationTester = async ({ emit }) => {
    const config = await getIntegrationConfig("crons")
    if (!config.cronSecret) fail("Cron secret não configurado: as rotas /api/routines/* recusarão toda chamada")
    emit("success", "Cron secret configurado")
    emit("info", "Disparo: tick interno (processo persistente)")

    if (!config.schedulerEnabled) {
        emit("warn", "Agendador desligado: nenhuma rotina será disparada")
    } else {
        emit("success", "Agendador ativo")
    }

    await dbConnect()
    const states = await CronJobState.find({}).lean()
    const byId = new Map(states.map((state) => [state.jobId, state]))
    let failures = 0
    for (const job of config.jobs) {
        const state = byId.get(job.id)
        const next = state?.nextRunAt ? new Date(state.nextRunAt).toISOString() : "ainda não agendada"
        const status = state?.lastStatus === "error" ? "erro na última execução" : state?.lastStatus === "ok" ? "última execução OK" : "sem execuções"
        if (state?.lastStatus === "error") failures++
        emit(
            !job.enabled ? "info" : state?.lastStatus === "error" ? "warn" : "info",
            `• ${job.label}: ${job.enabled ? describeSchedule(job.schedule) : "desativada"} — ${status}; próxima: ${next}`,
        )
    }
    if (!config.schedulerEnabled) fail("Agendador desligado")
    return failures > 0 ? `Agendador ativo; ${failures} rotina(s) com erro na última execução` : "Agendador ativo e rotinas em dia"
}

// ---------------------------------------------------------------------------
// GitHub: token válido (GET /user), limite de uso e permissão de escrita em Issues
// ---------------------------------------------------------------------------

const testGithub: IntegrationTester = async ({ emit, signal }) => {
    const config = await getIntegrationConfig("github")
    if (!config.token) fail("Sem token: cadastre um token de acesso (PAT) em Campos privados")
    const base = (config.apiUrl || GITHUB_DEFAULT_API_URL).replace(/\/+$/, "")
    const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${config.token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "opex" }

    emit("step", `GET ${base}/user`)
    let res: Response
    try {
        res = await fetch(`${base}/user`, { headers, cache: "no-store", signal: stepSignal(signal, 20_000) })
    } catch (error) {
        fail(`Não foi possível conectar ao GitHub: ${describeFetchError(error)}`)
    }
    if (res.status === 401) fail("Token inválido ou expirado")
    if (!res.ok) fail(`O GitHub respondeu HTTP ${res.status}`)
    const user = (await res.json().catch(() => ({}))) as { login?: string; name?: string }
    emit("success", `Conectado como ${user.name ? `${user.name} (@${user.login})` : `@${user.login ?? "?"}`}`)

    const warnings: string[] = []
    const scopes = res.headers.get("x-oauth-scopes")
    if (scopes !== null) {
        // Token clássico: os escopos vêm no cabeçalho.
        if (!scopes.split(",").map((scope) => scope.trim()).some((scope) => scope === "repo" || scope === "public_repo")) {
            warnings.push("token sem escopo repo (não fecha nem comenta issues)")
            emit("warn", `Escopos do token: ${scopes || "nenhum"} — falta "repo"`)
        } else {
            emit("success", `Escopos do token: ${scopes}`)
        }
    } else {
        emit("info", "Token fine-grained: confirme Issues (leitura e escrita), Contents e Pull requests (leitura) nos repositórios vinculados")
    }

    emit("step", `GET ${base}/rate_limit`)
    const rate = await fetch(`${base}/rate_limit`, { headers, cache: "no-store", signal: stepSignal(signal, 20_000) }).catch(() => null)
    const core = rate?.ok ? ((await rate.json().catch(() => ({}))) as { resources?: { core?: { remaining?: number; limit?: number } } }).resources?.core : undefined
    if (core?.limit) {
        emit(core.remaining && core.remaining > 100 ? "info" : "warn", `Limite de uso: ${core.remaining}/${core.limit} requisições restantes nesta hora`)
        if ((core.remaining ?? 0) <= 100) warnings.push("limite de uso quase esgotado")
    }
    return warnings.length ? warnResult(`Conectado com restrição: ${warnings.join("; ")}`) : `Conectado como @${user.login ?? "?"}`
}

// ---------------------------------------------------------------------------
// Clientes: sem serviço externo — só confere o cadastro de clientes
// ---------------------------------------------------------------------------

const testOrcamentos: IntegrationTester = async ({ emit }) => {
    await dbConnect()
    const total = await OrcamentoClient.countDocuments()
    const active = await OrcamentoClient.countDocuments({ active: true })
    emit("info", `${total} cliente(s) cadastrado(s), ${active} ativo(s)`)
    return `Portal de clientes disponível (${active} cliente(s) ativo(s))`
}

export const INTEGRATION_TESTERS: Record<IntegrationId, IntegrationTester> = {
    pusher: testPusher,
    internal_api: testInternalApi,
    crons: testCrons,
    github: testGithub,
    ai: testAiHub,
    ai_opencode: testOpencode,
    ai_gemini: testGemini,
    ai_jev: testJev,
    orcamentos: testOrcamentos,
}
