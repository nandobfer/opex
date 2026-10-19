import { getOpencodeClient, streamOpencodeShell } from "@/lib/ai/opencode-client"
import { loadEnvironmentSettings } from "@/features/ai/server/settings"
import { EnvironmentLogSession } from "@/lib/db/models/EnvironmentLogSession"
import { EnvironmentRepoConfig } from "@/lib/db/models/EnvironmentRepoConfig"
import { IntegrationLog } from "@/lib/db/models/IntegrationLog"
import { DomainError } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { accessibleProject, type EnvironmentActor } from "./access"
import { loadEnvironment } from "./service"
import { appendEnvironmentLog } from "./runner"
import { composeProject, redact } from "../logic"
import { publishEnvironment } from "./events"
import { DEFAULT_REPO_CONFIG } from "../schemas"
import { accessDirectoryFor, logsCommand, removeAccess, writeAccess } from "./host"

/** Prefixo do `docker compose logs`: `serviço-1  | …` (ou `serviço  | …`). */
const SERVICE_PREFIX = /^([A-Za-z0-9_.-]+?)(?:-\d+)?\s+\|/
export function logLineService(line: string): string | null {
    return SERVICE_PREFIX.exec(line)?.[1] ?? null
}

const live = new Map<string, AbortController>()
export async function logsHistory(
    actor: EnvironmentActor,
    repoId: string,
    id: string,
    after?: string,
    service?: string,
) {
    await loadEnvironment(actor, repoId, id)
    const date = after ? new Date(after) : null
    const lines = await IntegrationLog.find({
        integrationId: "ai",
        "data.scope": `environment:${id}`,
        ...(date && Number.isFinite(date.getTime()) ? { ts: { $gte: date } } : {}),
    })
        .sort({ ts: -1, _id: -1 })
        .limit(500)
        .lean()
    return lines
        .reverse()
        .filter((line) => !service || logLineService(line.message) === service)
        .map((line) => ({ id: String(line._id), ts: line.ts.toISOString(), message: line.message }))
}
export async function logViewer(
    actor: EnvironmentActor,
    repoId: string,
    id: string,
    viewerId: string,
    remove: boolean,
) {
    const env = await loadEnvironment(actor, repoId, id)
    const { settings } = await loadEnvironmentSettings()
    if (!settings.enabled && !remove) throw new DomainError(409, "Ative Administração de sistema")
    const viewerKey = `${actor.userId}:${viewerId}`
    await EnvironmentLogSession.updateOne(
        { environmentId: id },
        { $setOnInsert: { environmentId: id } },
        { upsert: true },
    )
    await EnvironmentLogSession.updateOne(
        { environmentId: id },
        { $pull: { viewers: { $or: [{ id: viewerKey }, { expiresAt: { $lt: new Date() } }] } } },
    )
    if (!remove)
        await EnvironmentLogSession.updateOne(
            { environmentId: id },
            { $push: { viewers: { id: viewerKey, actorId: actor.userId, expiresAt: new Date(Date.now() + 90_000) } } },
        )
    const doc = await EnvironmentLogSession.findOne({ environmentId: id }).lean()
    if (!doc?.viewers.length) {
        // Encerrar o acompanhamento remove o shell no OpenCode, o que encerra o `logs -f` no host.
        live.get(id)?.abort()
        if (doc?.sessionId && !live.has(id)) await removeShell(doc.sessionId)
    } else if (!live.has(id) && doc.state !== "running") {
        const claim = await EnvironmentLogSession.updateOne(
            { environmentId: id, state: { $ne: "running" } },
            { $set: { state: "running", heartbeatAt: new Date() } },
        )
        if (claim.modifiedCount)
            void runLogs(actor, repoId, id, env).catch(() =>
                logger.warn({ environmentId: id }, "[environments] Logs indisponíveis"),
            )
    }
    return { viewers: doc?.viewers.length ?? 0 }
}

async function removeShell(shellId: string) {
    try {
        const { settings } = await loadEnvironmentSettings()
        const client = await getOpencodeClient()
        await client.shell.remove({ id: shellId, location: { directory: settings.sessionDirectory } })
    } catch {
        logger.warn("[environments] Shell de logs não removido; será tentado na reconciliação")
    }
}

/** Separa a saída em linhas completas (o resto fica para o próximo bloco). */
export function splitLogLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
    const text = buffer + chunk
    const parts = text.split("\n")
    const rest = parts.pop() ?? ""
    return { lines: parts.map((line) => line.replace(/\r$/, "")).filter((line) => line.trim()), rest: rest.slice(-16000) }
}

/**
 * Acompanhamento de logs compartilhado do ambiente: um shell do OpenCode com `docker compose logs -f`
 * (sem modelo). A saída chega por cursor, linha a linha, censurada e gravada no histórico do escopo do
 * ambiente; o primeiro espectador inicia e o último encerra.
 */
async function runLogs(
    actor: EnvironmentActor,
    repoId: string,
    id: string,
    env: Awaited<ReturnType<typeof loadEnvironment>>,
) {
    const controller = new AbortController()
    live.set(id, controller)
    let secretValues: string[] = []
    let accessDir: string | null = null
    let failed = false
    const { settings } = await loadEnvironmentSettings()
    const client = await getOpencodeClient().catch(() => null)
    const watcher = setInterval(() => {
        void (async () => {
            await EnvironmentLogSession.updateOne(
                { environmentId: id },
                { $pull: { viewers: { expiresAt: { $lt: new Date() } } }, $set: { heartbeatAt: new Date() } },
            )
            const current = await EnvironmentLogSession.findOne({ environmentId: id }).lean()
            if (!current?.viewers.length) controller.abort()
        })().catch(() => undefined)
    }, 15_000)
    watcher.unref?.()
    try {
        if (!client) throw new Error("OpenCode indisponível")
        const project = await accessibleProject(actor, repoId)
        const repo = await EnvironmentRepoConfig.findOne({ projectId: repoId }).lean()
        const repoConfig = repo?.config ?? DEFAULT_REPO_CONFIG
        // No remoto, o helper SSH é gravado no host pelo shell (sem variáveis: logs não precisam).
        if (repoConfig.mode === "remote") {
            accessDir = accessDirectoryFor(settings, "logs", id)
            await EnvironmentLogSession.updateOne({ environmentId: id }, { $set: { accessPath: accessDir } })
            secretValues = (
                await writeAccess(
                    client,
                    settings,
                    { environmentId: id, projectId: repoId, repoConfig, variables: null },
                    accessDir,
                )
            ).secretValues
        }
        const command = logsCommand({
            mode: repoConfig.mode,
            directory: env.config.directory,
            composeFile: env.config.composeFile,
            project: composeProject(project.repo, env.config.slug),
            accessDir,
        })
        await appendEnvironmentLog(id, "Acompanhamento de logs iniciado.")
        let buffer = ""
        let lastNotify = 0
        const result = await streamOpencodeShell(client, settings.sessionDirectory, command, {
            signal: controller.signal,
            onStart: async (shellId) => {
                await EnvironmentLogSession.updateOne({ environmentId: id }, { $set: { sessionId: shellId } })
            },
            onOutput: async (chunk) => {
                const { lines, rest } = splitLogLines(buffer, chunk)
                buffer = rest
                if (!lines.length) return
                await IntegrationLog.insertMany(
                    lines.slice(-500).map((line) => {
                        const service = logLineService(line)
                        return {
                            integrationId: "ai",
                            level: "info",
                            message: redact(line, secretValues).slice(0, 16000),
                            ts: new Date(),
                            data: { scope: `environment:${id}`, ...(service ? { service } : {}) },
                        }
                    }),
                )
                if (Date.now() - lastNotify > 1000) {
                    lastNotify = Date.now()
                    await publishEnvironment(repoId, id)
                }
            },
        })
        if (!controller.signal.aborted && result.exitCode !== 0) failed = true
    } catch {
        failed = true
    } finally {
        clearInterval(watcher)
        if (failed)
            await appendEnvironmentLog(
                id,
                "Acompanhamento de logs interrompido. Confira o OpenCode, o diretório e o Compose do ambiente (e o SSH, no acesso remoto); tente novamente.",
            ).catch(() => undefined)
        let accessRemoved = !accessDir
        if (accessDir && client)
            accessRemoved = await removeAccess(client, settings, accessDir)
                .then(() => true)
                .catch(() => false)
        await EnvironmentLogSession.updateOne(
            { environmentId: id },
            { $set: { state: "idle", sessionId: null, ...(accessRemoved ? { accessPath: null } : {}) } },
        )
        live.delete(id)
        await publishEnvironment(repoId, id)
    }
}

/** Após reinício: remove shells órfãos de logs e acessos remotos que ficaram no host. */
export async function reconcileLogs() {
    const sessions = await EnvironmentLogSession.find({ $or: [{ state: "running" }, { accessPath: { $ne: null } }] })
        .select("+accessPath")
        .lean()
    if (!sessions.length) return
    const { settings } = await loadEnvironmentSettings()
    for (const doc of sessions) {
        if (live.has(doc.environmentId)) continue
        try {
            const client = await getOpencodeClient()
            if (doc.sessionId)
                await client.shell.remove({ id: doc.sessionId, location: { directory: settings.sessionDirectory } }).catch(() => undefined)
            if (doc.accessPath) await removeAccess(client, settings, doc.accessPath)
        } catch {
            continue
        }
        await EnvironmentLogSession.updateOne(
            { _id: doc._id },
            { $set: { state: "idle", sessionId: null, accessPath: null, viewers: [] } },
        )
    }
}
