import { getOpencodeClient, runOpencodeShell, type OpencodeShellResult } from "@/lib/ai/opencode-client"
import { loadCentral, repoForProject, saveCentralTest } from "./centrals"
import { centralLogger } from "./log"
import { shellQuote } from "../preview-backup"
import type { CentralCheck, CentralTestOutcome } from "../types"
import { agenticAvailability, loadAgenticSettings } from "./settings"

/**
 * Teste da central: o OpenCode alcança o diretório, é um repositório git com as branches
 * configuradas, o gh está autenticado e o docker compose está disponível. Cada passo vai para o
 * log da central (o terminal da página mostra em tempo real).
 */


const firstLine = (result: OpencodeShellResult) => result.output.split("\n").find((line) => line.trim())?.trim() ?? ""

export async function testCentral(id: string): Promise<CentralTestOutcome> {
    const { doc, config } = await loadCentral(id)
    const log = centralLogger(id)
    const checks: CentralCheck[] = []
    const add = (check: CentralCheck) => {
        checks.push(check)
        const text = `${check.label}: ${check.detail}`
        if (check.status === "ok") log.success(text)
        else if (check.status === "warn") log.warn(text)
        else log.error(text)
    }
    log.step(`Testando a central ${doc.projectName}`)

    const { settings } = await loadAgenticSettings()
    const availability = await agenticAvailability(settings)
    add(availability.available ? { label: "Feature", status: "ok", detail: "ativa e OpenCode conectado" } : { label: "Feature", status: settings.enabled ? "error" : "warn", detail: availability.reason ?? "indisponível" })

    const repo = await repoForProject(doc.projectId)
    add(repo ? { label: "Repositório", status: "ok", detail: `${repo.repo} (vínculo do GitHub)` } : { label: "Repositório", status: "warn", detail: "produto sem repositório vinculado em Integrações › GitHub (o acompanhamento do PR usa a URL do PR)" })

    try {
        const client = await getOpencodeClient()
        const dir = config.sessionDirectory
        const run = (command: string, timeoutMs = 30_000) => runOpencodeShell(client, dir, command, { timeoutMs })

        const top = await run("git rev-parse --show-toplevel")
        if (top.exitCode !== 0) {
            add({ label: "Diretório das sessões", status: "error", detail: `${dir} não é um repositório git (${firstLine(top) || "sem saída"})` })
        } else {
            const topLevel = firstLine(top)
            add({ label: "Diretório das sessões", status: topLevel === dir ? "ok" : "warn", detail: topLevel === dir ? `${dir} é a raiz do repositório` : `a raiz do repositório é ${topLevel}` })

            for (const [label, branch] of [
                ["Branch base", config.git.baseBranch],
                ["Branch de destino do PR", config.git.prTargetBranch],
            ] as const) {
                const result = await run(`git ls-remote --exit-code --heads origin ${shellQuote(branch)}`)
                add({ label, status: result.exitCode === 0 ? "ok" : "error", detail: result.exitCode === 0 ? `origin/${branch} existe` : `origin/${branch} não encontrada` })
            }

            const gh = await run("gh auth status")
            add({ label: "GitHub CLI (gh)", status: gh.exitCode === 0 ? "ok" : "error", detail: gh.exitCode === 0 ? "autenticado" : firstLine(gh) || "gh não instalado ou sem login (gh auth login)" })

            const docker = await run("docker compose version")
            add({ label: "Docker Compose", status: docker.exitCode === 0 ? "ok" : "error", detail: docker.exitCode === 0 ? firstLine(docker) : firstLine(docker) || "docker compose indisponível" })

            const file = config.environment.composeFile.trim()
            const compose = await run(file ? `test -f ${shellQuote(file)} && echo ${shellQuote(file)}` : "ls compose.yaml compose.yml docker-compose.yaml docker-compose.yml 2>/dev/null | head -1")
            const found = firstLine(compose)
            add({ label: "Arquivo do compose", status: compose.exitCode === 0 && found ? "ok" : "error", detail: found ? found : file ? `${file} não encontrado` : "nenhum compose.yaml/docker-compose.yml na raiz" })

            const root = config.worktreeRoot || `${dir}/worktrees`
            const writable = await run(`mkdir -p ${shellQuote(root)} && test -w ${shellQuote(root)}`)
            add({ label: "Pasta dos worktrees", status: writable.exitCode === 0 ? "ok" : "error", detail: writable.exitCode === 0 ? root : `sem permissão de escrita em ${root}` })
        }
    } catch (error) {
        add({ label: "OpenCode", status: "error", detail: error instanceof Error ? error.message : String(error) })
    }

    const errors = checks.filter((check) => check.status === "error")
    const warnings = checks.filter((check) => check.status === "warn")
    const ok = errors.length === 0
    const message = ok ? (warnings.length ? `Pronta, com ${warnings.length} aviso(s)` : "Central pronta") : `${errors.length} problema(s): ${errors.map((check) => check.label).join(", ")}`
    if (ok) log.success(message)
    else log.error(message)
    await saveCentralTest(id, { ok, message })
    return { ok, message, checks }
}
