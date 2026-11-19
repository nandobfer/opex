import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { AgenticWorkbench, type IAgenticWorkbench, type IWorkbenchPlugin } from "@/lib/db/models/Agentic"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { Plugin } from "@/lib/db/models/Plugin"
import { getLocalUser } from "@/lib/local-user"
import { withBasePath } from "@/lib/base-path"
import { loggerFor } from "@/lib/logger"
import { isPluginTaskType } from "@/features/tasks/constants"
import { pluginIdFromTitle, uniquePluginId } from "@/features/plugins/logic"
import { normalizePluginFiles, type PluginSourceFile } from "@/features/plugins/manifest"
import { createDraftVersion, createPluginRecord, discardPreview, findPlugin, pluginVersionFiles, publishPreviewVersion, consolidateVersion } from "@/features/plugins/server/service"
import { PLUGIN_BASE_BRANCH, PLUGIN_TESTS_TIMEOUT_MS, PLUGIN_WORK_BRANCH, pluginPreviewPath, pluginWorkDirFor } from "../plugin-flow"
import { shellQuote } from "../preview-backup"
import type { CentralConfig } from "../schemas"

/**
 * Fluxo Plugin da mesa (OPE-172) — a parte que fala com o host do OpenCode e com o serviço de
 * plugins. O servidor do Opex e o host NÃO compartilham disco: as fontes vão e voltam pela API do
 * OpenCode (`file.write`/`file.read`) e os comandos (git, testes) pelo `shell` dele.
 */

const log = () => loggerFor({ module: "agentic.plugin" })

export interface TaskPluginInfo {
    taskType: string | null
    pluginTarget?: { scope: "owner" | "client"; clientId: string | null; pluginId: string | null } | null
}

/** Tipo e estado inicial da mesa na abertura (congelado: a mesa não muda de tipo depois). */
export function workbenchKindFor(task: TaskPluginInfo): { kind: "repo"; plugin: null } | { kind: "plugin"; plugin: IWorkbenchPlugin } {
    if (!isPluginTaskType(task.taskType)) return { kind: "repo", plugin: null }
    const target = task.pluginTarget ?? { scope: "owner" as const, clientId: null, pluginId: null }
    return {
        kind: "plugin",
        plugin: { pluginId: target.pluginId ?? null, scope: target.scope, clientId: target.scope === "client" ? target.clientId : null, baseVersionId: null, draftVersionId: null, workDir: null, approved: false, compileAttempts: 0, testAttempts: 0 },
    }
}

export const isPluginWorkbench = (doc: Pick<IAgenticWorkbench, "kind">) => doc.kind === "plugin"

async function host() {
    const { openHost } = await import("@/features/opencode-resources/server/host")
    return openHost()
}

/** Nome do cliente para os prompts. */
export async function pluginClientName(clientId: string | null): Promise<string | null> {
    if (!clientId) return null
    await dbConnect()
    const client = await OrcamentoClient.findById(clientId, { name: 1 }).lean().catch(() => null)
    return client?.name ?? null
}

/** Arquivos do SDK (`plugin-sdk/` do app) para a pasta de trabalho. */
async function sdkFiles(): Promise<PluginSourceFile[]> {
    const root = path.join(process.cwd(), "plugin-sdk")
    const files: PluginSourceFile[] = []
    async function walk(dir: string) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) await walk(full)
            else files.push({ path: path.relative(root, full).split(path.sep).join("/"), content: await readFile(full, "utf8") })
        }
    }
    await walk(root)
    return files
}

/** Esqueleto de um plugin novo (do SDK), com o id e o nome trocados. */
export function skeletonFiles(sdk: PluginSourceFile[], target: { pluginId: string; name: string; scope: "owner" | "client" }): PluginSourceFile[] {
    const prefix = `skeleton/${target.scope}/`
    return sdk
        .filter((file) => file.path.startsWith(prefix))
        .map((file) => ({ path: file.path.slice(prefix.length), content: file.content.replaceAll("__PLUGIN_ID__", target.pluginId).replaceAll("__PLUGIN_NAME__", target.name.replaceAll('"', "'")) }))
}

/** Arquivos de ambiente na raiz da pasta (vêm do template do SDK; não voltam para a versão). */
export function environmentFiles(sdk: PluginSourceFile[]): PluginSourceFile[] {
    const prefix = "template/"
    // `gitignore` sem ponto no SDK: com o ponto, ele valeria dentro do próprio repositório do Opex.
    return sdk.filter((file) => file.path.startsWith(prefix)).map((file) => ({ path: file.path.slice(prefix.length) === "gitignore" ? ".gitignore" : file.path.slice(prefix.length), content: file.content }))
}

/** Comandos da pasta de trabalho: `git init`, commit base e a ref `origin/opex-base` (base do diff). */
export function workspaceInitCommand(workDir: string): string {
    const dir = shellQuote(workDir)
    return [
        `cd ${dir}`,
        `git init -q -b ${PLUGIN_WORK_BRANCH} 2>/dev/null || (git init -q && git checkout -q -b ${PLUGIN_WORK_BRANCH})`,
        "git add -A",
        'git -c user.name="Opex" -c user.email="opex@localhost" commit -q --allow-empty -m "Versão base do plugin (Opex)"',
        `git update-ref refs/remotes/origin/${PLUGIN_BASE_BRANCH} HEAD`,
    ].join(" && ")
}

async function writeWorkspace(workDir: string, files: PluginSourceFile[]): Promise<void> {
    const h = await host()
    const dirs = [...new Set(files.map((file) => path.posix.dirname(path.posix.join(workDir, file.path))))]
    const mkdir = await h.run(`mkdir -p ${dirs.map(shellQuote).join(" ")}`, 30_000)
    if (mkdir.exitCode !== 0) throw new Error(`Não foi possível criar a pasta de trabalho do plugin: ${mkdir.output.slice(-300)}`)
    for (const file of files) await h.writeText(path.posix.join(workDir, file.path), file.content)
}

/**
 * Prepara a implementação de uma mesa Plugin: garante o cadastro do plugin (novo: id pelo título),
 * fixa a versão base (a stable do início) e exporta fontes + SDK para a pasta de trabalho no host,
 * só na primeira rodada (as correções continuam na mesma pasta).
 */
export async function preparePluginImplementation(doc: IAgenticWorkbench, config: CentralConfig): Promise<IWorkbenchPlugin & { pluginId: string; workDir: string }> {
    await dbConnect()
    const state = doc.plugin
    if (!state) throw new DomainError(409, "A mesa não é de plugin", "WORKBENCH_NOT_PLUGIN")
    let pluginId = state.pluginId
    let plugin = pluginId ? await findPlugin(pluginId) : null
    if (pluginId && !plugin) throw new DomainError(404, `Plugin "${pluginId}" não encontrado`, "PLUGIN_NOT_FOUND")
    if (!plugin) {
        const taken = new Set((await Plugin.find({}, { pluginId: 1 }).lean()).map((item) => item.pluginId))
        pluginId = uniquePluginId(pluginIdFromTitle(doc.taskTitle), taken)
        plugin = await createPluginRecord({ pluginId, name: doc.taskTitle.slice(0, 80), scope: state.scope, clientId: state.clientId, actorId: getLocalUser().id })
    }
    if (plugin.scope !== state.scope || (plugin.scope === "client" && plugin.clientId !== state.clientId)) throw new DomainError(409, "O plugin escolhido é de outro escopo ou cliente", "PLUGIN_SCOPE_MISMATCH")
    const workDir = state.workDir ?? pluginWorkDirFor(config, doc.taskCode)
    const baseVersionId = state.baseVersionId ?? plugin.stableVersionId ?? null
    // Novo turno do agente: a marca de compilação pendente e o descritivo da rodada anterior não valem
    // mais (senão o Tentar novamente de uma falha deste turno só recompilaria a pasta, sem o agente).
    const next = { ...state, pluginId: plugin.pluginId, baseVersionId, workDir, compileAttempts: 0, compilePending: false, changeSummary: null }

    const h = await host()
    const exists = await h.run(`test -d ${shellQuote(`${workDir}/.git`)}`, 15_000, { quiet: true })
    if (exists.exitCode !== 0) {
        const sdk = await sdkFiles()
        const sources = baseVersionId ? await pluginVersionFiles(plugin.pluginId, baseVersionId) : skeletonFiles(sdk, { pluginId: plugin.pluginId, name: plugin.name, scope: plugin.scope })
        await writeWorkspace(workDir, [...sdk.map((file) => ({ path: `.opex-sdk/${file.path}`, content: file.content })), ...environmentFiles(sdk), ...sources])
        const init = await h.run(workspaceInitCommand(workDir), 60_000)
        if (init.exitCode !== 0) throw new Error(`Não foi possível iniciar o git da pasta do plugin: ${init.output.slice(-300)}`)
        log().info({ workbenchId: String(doc._id), pluginId: plugin.pluginId, workDir, base: baseVersionId }, "[plugins] Pasta de trabalho exportada")
    }
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { plugin: next } })
    return next as IWorkbenchPlugin & { pluginId: string; workDir: string }
}

/** Fontes da pasta de trabalho (rastreadas + novas, sem o que o `.gitignore` exclui). */
export async function readPluginWorkspace(workDir: string): Promise<PluginSourceFile[]> {
    const h = await host()
    const listed = await h.run(`cd ${shellQuote(workDir)} && git ls-files -co --exclude-standard`, 30_000, { quiet: true })
    if (listed.exitCode !== 0) throw new Error(`Não foi possível listar as fontes do plugin: ${listed.output.slice(-300)}`)
    const paths = listed.output.split("\n").map((line) => line.trim()).filter(Boolean)
    const files: PluginSourceFile[] = []
    for (const relative of normalizePluginFiles(paths.map((p) => ({ path: p, content: "" }))).map((file) => file.path)) {
        const content = await h.readText(path.posix.join(workDir, relative))
        if (content !== null) files.push({ path: relative, content })
    }
    return files
}

export type PluginDraftOutcome = { ok: true; versionId: string; number: number } | { ok: false; issues: string[] }

/** Lê a pasta, valida e compila a versão `draft` da mesa. */
export async function buildPluginDraft(doc: IAgenticWorkbench): Promise<PluginDraftOutcome> {
    const state = doc.plugin
    if (!state?.pluginId || !state.workDir) throw new Error("A mesa de plugin ficou sem a pasta de trabalho")
    const files = await readPluginWorkspace(state.workDir)
    const result = await createDraftVersion({
        pluginId: state.pluginId,
        files,
        baseVersionId: state.baseVersionId,
        source: { taskId: doc.taskId, taskCode: doc.taskCode, workbenchId: String(doc._id) },
        author: getLocalUser().id,
        changeSummary: state.changeSummary ?? null,
    })
    if (!result.ok) {
        await AgenticWorkbench.updateOne({ _id: doc._id }, { $inc: { "plugin.compileAttempts": 1 } })
        return result
    }
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { "plugin.draftVersionId": result.versionId, "plugin.compileAttempts": 0 } })
    return { ok: true, versionId: result.versionId, number: result.number }
}

/** Publica a draft da mesa como prévia ao vivo e grava o endereço da prévia na mesa. */
export async function publishPluginPreview(doc: IAgenticWorkbench): Promise<{ previewUrl: string; number: number; runtimeError: string | null }> {
    const state = doc.plugin
    if (!state?.pluginId || !state.draftVersionId) throw new Error("A mesa de plugin não tem versão para a prévia")
    const published = await publishPreviewVersion(state.pluginId, state.draftVersionId, { workbenchId: String(doc._id), actorId: getLocalUser().id }).catch((error: unknown) => restartOnOutdatedBase(doc, error))
    const { PluginVersion } = await import("@/lib/db/models/Plugin")
    const version = await PluginVersion.findById(state.draftVersionId, { manifest: 1 }).lean()
    // Com o subcaminho público: o link da mesa é um `<a>` comum (abre em nova guia).
    const previewUrl = withBasePath(pluginPreviewPath({ pluginId: state.pluginId, scope: state.scope }, version?.manifest ?? { pages: [], slots: [] }))
    return { previewUrl, number: published.number, runtimeError: published.runtimeError }
}

/** Testes do plugin no host (comando determinístico, sem agente): código de saída e o fim da saída. */
export async function runPluginTests(workDir: string, signal?: AbortSignal): Promise<{ exitCode: number | null; output: string }> {
    const h = await host()
    // Desacoplado do shell e com o sinal: o "Parar" da mesa encerra o comando no host.
    const result = await h.run(`cd ${shellQuote(workDir)} && (test -d node_modules || pnpm install --silent || npm install --silent) && npx vitest run --reporter=dot`, PLUGIN_TESTS_TIMEOUT_MS, { detached: true, signal })
    return { exitCode: result.exitCode, output: result.output }
}

/** Consolida a prévia da mesa como `stable` (transacional no kernel) e remove a pasta de trabalho. */
export async function consolidatePluginWorkbench(doc: IAgenticWorkbench): Promise<{ number: number }> {
    const state = doc.plugin
    if (!state?.pluginId || !state.draftVersionId) throw new Error("A mesa de plugin não tem versão para consolidar")
    const result = await consolidateVersion(state.pluginId, state.draftVersionId, getLocalUser().id).catch((error: unknown) => restartOnOutdatedBase(doc, error))
    await removePluginWorkDir(state.workDir)
    return result
}

/**
 * Outra mesa consolidou o plugin depois que esta começou (`PLUGIN_BASE_OUTDATED`): a mesa volta a partir
 * da estável atual — descarta a prévia dela, a pasta e a aprovação, e a próxima implementação (Voltar ao
 * planejamento) exporta a estável de agora. O erro segue para a mesa com a orientação em pt-BR.
 */
async function restartOnOutdatedBase(doc: IAgenticWorkbench, error: unknown): Promise<never> {
    if (!(error instanceof DomainError) || error.code !== "PLUGIN_BASE_OUTDATED" || !doc.plugin) throw error
    await releasePluginPreview(doc).catch(() => undefined)
    await removePluginWorkDir(doc.plugin.workDir)
    await AgenticWorkbench.updateOne({ _id: doc._id }, { $set: { "plugin.baseVersionId": null, "plugin.draftVersionId": null, "plugin.workDir": null, "plugin.approved": false, "plugin.testAttempts": 0, "plugin.changeSummary": null, previewUrl: null } })
    throw new DomainError(409, `${error.message}: use "Voltar ao planejamento" e a próxima implementação parte da estável atual.`, error.code)
}

/** Remove a pasta de trabalho (melhor esforço; idempotente). */
export async function removePluginWorkDir(workDir: string | null): Promise<void> {
    if (!workDir) return
    try {
        await (await host()).run(`rm -rf ${shellQuote(workDir)}`, 60_000)
    } catch (error) {
        log().warn({ err: error, workDir }, "[plugins] Falha ao remover a pasta de trabalho")
    }
}

/** Mesa Plugin concluída sem consolidar (manual) ou excluída: a prévia que era dela é descartada. */
export async function releasePluginPreview(doc: IAgenticWorkbench): Promise<void> {
    const pluginId = doc.plugin?.pluginId
    if (!pluginId) return
    const plugin = await findPlugin(pluginId)
    if (plugin?.previewWorkbenchId === String(doc._id)) await discardPreview(pluginId, getLocalUser().id)
}

/**
 * "Aprovar prévia" na página do plugin (dono ou admin do cliente): a prévia segue para os testes e a
 * consolidação (a mesma ação "Aprovar" da mesa dona da prévia). O portal só aprova plugin do
 * PRÓPRIO cliente.
 */
export async function approvePluginPreview(pluginId: string, access: { kind: "owner" } | { kind: "client"; clientId: string }, actorId: string): Promise<void> {
    const plugin = await findPlugin(pluginId)
    if (!plugin || (access.kind === "client" && (plugin.scope !== "client" || plugin.clientId !== access.clientId))) throw new DomainError(404, "Plugin não encontrado", "PLUGIN_NOT_FOUND")
    if (plugin.archivedAt) throw new DomainError(409, `O plugin ${plugin.name} está arquivado. Desarquive-o antes`, "PLUGIN_ARCHIVED")
    if (!plugin.previewVersionId || !plugin.previewWorkbenchId) throw new DomainError(409, "O plugin não tem uma prévia aguardando aprovação", "PLUGIN_NO_PREVIEW")
    const { approve } = await import("./workflow")
    await approve(plugin.previewWorkbenchId, { approvedBy: actorId })
}

/** Aprovação pelo admin do cliente no portal (`approvePluginPreview` no escopo do cliente). */
export async function approvePluginPreviewFromPortal(pluginId: string, clientId: string, actorId: string): Promise<void> {
    await approvePluginPreview(pluginId, { kind: "client", clientId }, actorId)
}
