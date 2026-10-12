import { runOpencodeShell, type OpencodeClient } from "@/lib/ai/opencode-client"
import { AgenticWorkbench, type IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { randomId } from "@/lib/random-id"
import { dirname } from "node:path"
import { shellQuote } from "../preview-backup"
import type { CentralConfig } from "../schemas"

/** Estado fora do worktree: o runner retoma a mesma execução após reconexão. */
export async function reserveRemotePreview(client: OpencodeClient, doc: IAgenticWorkbench, config: CentralConfig, repo: string, port: number, backup: { dir: string; path: string }, context: { branch: string; worktreePath: string; composeProject: string }) {
    const attempt = randomId()
    const statePath = `${backup.dir}/remote-preview-${attempt}.json`
    const currentPath = `${backup.dir}/remote-current`
    const state = { attempt, currentPath, active: true, repo, port, min: config.environment.previewPortMin, max: config.environment.previewPortMax, workflow: config.environment.githubWorkflow, service: config.environment.previewService, composeFile: config.environment.composeFile || "docker-compose.yml", portEnvVar: config.environment.portEnvVar, previewHost: config.environment.previewHost, healthPath: config.environment.healthPath || "/", timeoutMinutes: config.environment.buildTimeoutMinutes, backupPath: backup.path, ...context }
    const write = `printf '%s' ${shellQuote(JSON.stringify(state))} > ${shellQuote(statePath)} && printf '%s' ${shellQuote(attempt)} > ${shellQuote(currentPath)}`
    const result = await runOpencodeShell(client, config.sessionDirectory, `mkdir -p ${shellQuote(backup.dir)} && flock ${shellQuote(`${backup.dir}/preview-publish.lock`)} sh -c ${shellQuote(write)}`, { timeoutMs: 150_000 })
    if (result.exitCode !== 0) throw new Error("Não foi possível reservar a tentativa da prévia remota")
    const build = { method: "github" as const, attempt, statePath }
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { previewBuild: build, buildQueuedAt: null } })
    return build
}

export async function invalidateRemotePreview(client: OpencodeClient, doc: IAgenticWorkbench, directory: string): Promise<void> {
    if (doc.previewBuild?.method !== "github" || !doc.previewBuild.statePath) return
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
