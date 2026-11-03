/** Installed by setup-preview-workflow. No SSH, registry or production secrets. */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdtempSync, statSync, createReadStream } from "node:fs"
import { dirname, resolve } from "node:path"
import { createServer } from "node:net"
import { pathToFileURL } from "node:url"

export interface PreviewState {
    attempt: string; currentPath: string; active: boolean; repo: string; branch: string; worktreePath: string
    composeProject: string; composeFile: string; service: string; portEnvVar: string
    port: number; min: number; max: number; workflow: string; timeoutMinutes: number
    healthPath: string; previewHost: string; backupPath: string; dumpRequired?: boolean; sha?: string; runId?: number; published?: boolean
}

export function validateState(s: PreviewState, attempt: string): void {
    if (!s.active || s.attempt !== attempt || !/^[A-Za-z0-9_-]+$/.test(attempt)) throw new Error("Tentativa cancelada ou substituída")
    if (!Number.isInteger(s.port) || !Number.isInteger(s.min) || !Number.isInteger(s.max) || s.min < 1024 || s.max > 65535 || s.port < s.min || s.port > s.max) throw new Error("Porta fora da faixa reservada")
    if (!/^[\w.-]+\/[\w.-]+$/.test(s.repo) || !/^[\w.-]+\.ya?ml$/.test(s.workflow)) throw new Error("Repositório/workflow inválido")
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s.portEnvVar) || !/^[a-z0-9][a-z0-9_-]*$/.test(s.composeProject) || !/^[\w-]+$/.test(s.service)) throw new Error("Configuração do Compose inválida")
    if (!Number.isFinite(s.timeoutMinutes) || s.timeoutMinutes < 2 || s.timeoutMinutes > 120) throw new Error("Tempo máximo inválido")
    if (!/^[A-Za-z0-9.-]+$/.test(s.previewHost)) throw new Error("Host da prévia inválido")
}

export function validateManifest(manifest: { attempt: string; sha: string; image: string; checksum: string }, s: PreviewState, checksum: string): void {
    if (manifest.attempt !== s.attempt || manifest.sha !== s.sha || manifest.image !== `opex-preview:${s.attempt}` || manifest.checksum !== checksum) throw new Error("Artefato não corresponde ao SHA/tentativa ou checksum inválido")
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const command = (name: string, args: string[], cwd: string, env = process.env): string => execFileSync(name, args, { cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }).trim()

async function portBusy(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = createServer()
        server.once("error", () => resolve(true))
        server.listen(port, "0.0.0.0", () => server.close(() => resolve(false)))
    })
}

export async function runPreview(statePath: string, attempt: string): Promise<void> {
    const current = () => {
        // O estado pode sumir no meio da execução: o app invalida a tentativa apagando o arquivo. A
        // mensagem diz o que aconteceu, em vez de um ENOENT sem contexto.
        let raw: string
        try {
            raw = readFileSync(statePath, "utf8")
        } catch {
            throw new Error("Tentativa cancelada ou substituída (o estado da prévia não existe mais)")
        }
        const s = JSON.parse(raw) as PreviewState
        validateState(s, attempt)
        if (readFileSync(s.currentPath, "utf8") !== attempt) throw new Error("Tentativa substituída")
        return s
    }
    let s = current()
    const cwd = s.worktreePath
    const save = (patch: Partial<PreviewState>) => {
        s = { ...current(), ...patch }
        writeFileSync(statePath, JSON.stringify(s))
    }
    const gh = (...args: string[]) => command("gh", args, cwd)
    const git = (...args: string[]) => command("git", args, cwd)
    // Recovery refuses to publish a different commit, even if the agent changed the worktree.
    if (git("status", "--porcelain")) throw new Error("Faça commit das alterações antes da prévia; nunca envie .env ou backups")
    const sha = git("rev-parse", "HEAD")
    if (!/^[a-f0-9]{40}$/.test(sha) || (s.sha && s.sha !== sha)) throw new Error("O código mudou: inicie uma nova tentativa")
    if (git("branch", "--show-current") !== s.branch) throw new Error("Branch diferente da mesa")
    const defaultBranch = gh("api", `repos/${s.repo}`, "--jq", ".default_branch")
    if (gh("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner").toLowerCase() !== s.repo.toLowerCase()) throw new Error("O origin do worktree não corresponde ao repositório da central")
    if (s.branch === defaultBranch) throw new Error("Não publique prévia a partir da branch padrão")
    save({ sha })
    const deadline = Date.now() + s.timeoutMinutes * 60_000
    const cancel = () => { if (s.runId) { try { gh("run", "cancel", String(s.runId), "--repo", s.repo) } catch { /* already completed */ } } }
    const check = () => {
        try { current() } catch (error) { cancel(); throw error }
        if (Date.now() > deadline) { cancel(); throw new Error("Tempo máximo da prévia esgotado") }
    }
    process.once("SIGTERM", () => { cancel(); process.exit(1) })
    process.once("SIGINT", () => { cancel(); process.exit(1) })
    if (!s.runId) {
        git("push", "-u", "origin", `HEAD:refs/heads/${s.branch}`)
        // Workflow always from default branch; build checks out the explicit immutable SHA.
        gh("workflow", "run", s.workflow, "--repo", s.repo, "--ref", defaultBranch, "-f", `attempt=${attempt}`, "-f", `sha=${sha}`, "-f", `preview_url=http://${s.previewHost}:${s.port}`)
        while (!s.runId) {
            check()
            const runs = JSON.parse(gh("run", "list", "--repo", s.repo, "--workflow", s.workflow, "--event", "workflow_dispatch", "--limit", "100", "--json", "databaseId,displayTitle")) as { databaseId: number; displayTitle: string }[]
            const run = runs.find((r) => r.displayTitle === `preview-${attempt}`)
            if (run) save({ runId: run.databaseId })
            else await sleep(5000)
        }
    }
    process.stdout.write(`Prévia GitHub: https://github.com/${s.repo}/actions/runs/${s.runId}\n`)
    while (true) {
        check()
        const run = JSON.parse(gh("run", "view", String(s.runId), "--repo", s.repo, "--json", "status,conclusion")) as { status: string; conclusion: string }
        if (run.status === "completed") {
            if (run.conclusion !== "success") throw new Error(`Testes/build remoto falharam (${run.conclusion}); consulte os logs da execução`)
            break
        }
        await sleep(10_000)
    }
    const artifactDir = mkdtempSync(resolve(dirname(statePath), `artifact-${attempt}-`))
    gh("run", "download", String(s.runId), "--repo", s.repo, "--name", `preview-${attempt}`, "--dir", artifactDir)
    const archive = resolve(artifactDir, "image.tar.gz")
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(archive)) hash.update(chunk)
    const checksum = hash.digest("hex")
    const manifest = JSON.parse(readFileSync(resolve(artifactDir, "manifest.json"), "utf8")) as { attempt: string; sha: string; image: string; checksum: string }
    validateManifest(manifest, s, checksum)
    check()
    // Sem o dump obrigatório na central (projetos sem banco de dados) o arquivo não é exigido; estados
    // antigos, sem o campo, continuam exigindo o backup.
    if (s.dumpRequired !== false && statSync(s.backupPath).size === 0) throw new Error("Backup MongoDB obrigatório ausente/vazio")
    if (git("rev-parse", "HEAD") !== sha || git("status", "--porcelain")) throw new Error("Worktree mudou durante o build")
    const docker = (...args: string[]) => command("docker", args, cwd)
    const compose = ["compose", "-p", s.composeProject, "-f", s.composeFile]
    const ownContainer = docker(...compose, "ps", "-q", s.service)
    if (await portBusy(s.port)) {
        const bindings = ownContainer ? docker("inspect", ownContainer, "--format", "{{json .NetworkSettings.Ports}}") : ""
        const ports = bindings ? JSON.parse(bindings) as Record<string, { HostPort: string }[] | null> : {}
        if (!Object.values(ports).some((list) => list?.some((p) => p.HostPort === String(s.port)))) throw new Error("Porta reservada ocupada por outro processo; não será substituída")
    }
    docker("load", "-i", archive)
    const image = `opex-preview:${attempt}`
    const override = resolve(dirname(statePath), `compose-${attempt}.json`)
    writeFileSync(override, JSON.stringify({ services: { [s.service]: { image, pull_policy: "never" } } }))
    check()
    const env = { ...process.env, [s.portEnvVar]: String(s.port) }
    // Same lock as Opex's reservation/invalidation: a stale attempt cannot overwrite
    // a newer deployment between validation and Compose's container recreation.
    const publish = `const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if(!s.active||s.attempt!==process.argv[2]||fs.readFileSync(s.currentPath,'utf8')!==s.attempt) throw Error('Tentativa invalidada'); require('child_process').execFileSync('docker',JSON.parse(process.argv[3]),{stdio:'inherit'});`
    command("flock", [resolve(dirname(statePath), "preview-publish.lock"), "node", "-e", publish, statePath, attempt, JSON.stringify([...compose, "-f", override, "up", "-d", "--no-build", "--pull", "never", s.service])], cwd, env)
    check()
    const container = command("docker", [...compose, "ps", "-q", s.service], cwd, env)
    if (docker("inspect", container, "--format", "{{.Image}}") !== docker("image", "inspect", image, "--format", "{{.Id}}")) throw new Error("Container não usa a imagem desta tentativa")
    for (let i = 0; i < 30; i++) {
        check()
        try {
            const response = await fetch(`http://127.0.0.1:${s.port}${s.healthPath}`, { signal: AbortSignal.timeout(5000), redirect: "manual" })
            if (response.status >= 200 && response.status < 400) {
                save({ published: true })
                process.stdout.write(`Prévia publicada na porta ${s.port}, SHA ${sha}\n`)
                return
            }
        } catch { /* retry until deadline */ }
        await sleep(3000)
    }
    throw new Error("A prévia não respondeu ao teste de saúde")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    runPreview(process.argv[2], process.argv[3]).catch((error: unknown) => {
        process.stderr.write(`[preview] ${error instanceof Error ? error.message : "Falha na prévia"}\n`)
        process.exitCode = 1
    })
}
