import { runOpencodeShell, type OpencodeClient } from "@/lib/ai/opencode-client"
import { AgenticWorkbench, type IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { randomId } from "@/lib/random-id"
import { dirname } from "node:path"
import { shellQuote } from "../preview-backup"
import type { CentralConfig } from "../schemas"

/**
 * Estado fora do worktree: o runner retoma a mesma execução após reconexão. `range` é a faixa efetiva
 * de portas da central (a padrão global ou a própria — `resolveCentralPorts`).
 */
export async function reserveRemotePreview(client: OpencodeClient, doc: IAgenticWorkbench, config: CentralConfig, repo: string, port: number, range: { min: number; max: number }, backup: { dir: string; path: string }, context: { branch: string; worktreePath: string; composeProject: string }) {
    const attempt = randomId()
    const dumpRequired = config.environment.backupDatabase
    const statePath = `${backup.dir}/remote-preview-${attempt}.json`
    const currentPath = `${backup.dir}/remote-current`
    const state = { attempt, currentPath, active: true, repo, port, min: range.min, max: range.max, workflow: config.environment.githubWorkflow, service: config.environment.previewService, composeFile: config.environment.composeFile || "docker-compose.yml", portEnvVar: config.environment.portEnvVar, previewHost: config.environment.previewHost, healthPath: config.environment.healthPath || "/", timeoutMinutes: config.environment.buildTimeoutMinutes, backupPath: backup.path, dumpRequired, ...context }
    const write = `printf '%s' ${shellQuote(JSON.stringify(state))} > ${shellQuote(statePath)} && printf '%s' ${shellQuote(attempt)} > ${shellQuote(currentPath)}`
    const result = await runOpencodeShell(client, config.sessionDirectory, `mkdir -p ${shellQuote(backup.dir)} && flock ${shellQuote(`${backup.dir}/preview-publish.lock`)} sh -c ${shellQuote(write)}`, { timeoutMs: 150_000 })
    if (result.exitCode !== 0) throw new Error("Não foi possível reservar a tentativa da prévia remota")
    const build = { method: "github" as const, attempt, statePath, dumpRequired }
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { previewBuild: build, buildQueuedAt: null } })
    return build
}

/**
 * Apaga a reserva da tentativa (o script passa a recusá-la). `expected` limita a invalidação à
 * tentativa que falhou: a falha de um turno pode chegar depois de a mesa já ter reservado outra
 * tentativa, e apagar o estado da NOVA derrubava o script dela (`ENOENT` no meio da espera).
 */
export async function invalidateRemotePreview(client: OpencodeClient, doc: IAgenticWorkbench, directory: string, expected?: { attempt?: string | null }): Promise<void> {
    if (doc.previewBuild?.method !== "github" || !doc.previewBuild.statePath) return
    if (expected && expected.attempt !== undefined && doc.previewBuild.attempt !== expected.attempt) return
    const result = await runOpencodeShell(client, directory, `test ! -e ${shellQuote(doc.previewBuild.statePath)} || flock ${shellQuote(`${dirname(doc.previewBuild.statePath)}/preview-publish.lock`)} rm -f ${shellQuote(doc.previewBuild.statePath)}`, { timeoutMs: 150_000 })
    if (result.exitCode !== 0) throw new Error("Não foi possível invalidar a tentativa remota; publicação não cancelada")
}

export async function assertRemotePreview(client: OpencodeClient, doc: IAgenticWorkbench, directory: string): Promise<void> {
    if (doc.previewBuild?.method !== "github") return
    if (!doc.previewBuild.statePath || !doc.previewBuild.attempt) throw new Error("Tentativa remota sem reserva")
    const command = `node -e ${shellQuote("const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if(s.attempt!==process.argv[2] || fs.readFileSync(s.currentPath,'utf8')!==s.attempt || !s.active || !s.published || !s.runId || !s.sha) process.exit(1)")} ${shellQuote(doc.previewBuild.statePath)} ${shellQuote(doc.previewBuild.attempt)}`
    const result = await runOpencodeShell(client, directory, command, { timeoutMs: 15_000 })
    if (result.exitCode !== 0) throw new Error("A execução remota não confirmou a publicação desta tentativa")
}
