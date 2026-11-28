import { USED_PORTS_FILE } from "./constants"
import { repoFromRemote } from "./repo-name"

/**
 * Conferências no host do OpenCode (módulo puro): os comandos de shell e a leitura da saída. Quem roda
 * é o servidor, pelo shell do OpenCode (`openHost().run`). Os comandos imprimem só marcadores
 * (`CHAVE=valor`), nunca o conteúdo de arquivos como o `.env`.
 */

/** Aspas simples do shell POSIX. */
export const shq = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

// ── Diretório da etapa 1 ──────────────────────────────────────────────────────

export function directoryCheckCommand(path: string): string {
    const dir = shq(path)
    return [
        `if [ ! -e ${dir} ]; then echo STATE=absent`,
        `elif [ ! -d ${dir} ]; then echo STATE=file`,
        `elif [ -z "$(ls -A ${dir} 2>/dev/null)" ]; then echo STATE=empty`,
        `elif [ "$(git -C ${dir} rev-parse --show-toplevel 2>/dev/null)" = "$(cd ${dir} && pwd -P)" ]; then echo STATE=git; echo "ORIGIN=$(git -C ${dir} remote get-url origin 2>/dev/null)"`,
        `else echo STATE=other; fi`,
    ].join("; ")
}

export type DirectoryCheck =
    | { kind: "free"; reason: null; message: string }
    | { kind: "clone"; reason: null; message: string }
    | { kind: "blocked"; reason: string; message: string }

const marker = (output: string, key: string): string | null => {
    const line = output
        .split("\n")
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${key}=`))
    return line === undefined ? null : line.slice(key.length + 1).trim()
}

export function classifyDirectory(output: string, repo: string): DirectoryCheck {
    const state = marker(output, "STATE")
    switch (state) {
        case "absent":
            return { kind: "free", reason: null, message: "A pasta não existe: será criada." }
        case "empty":
            return { kind: "free", reason: null, message: "A pasta está vazia." }
        case "file":
            return { kind: "blocked", reason: "O caminho aponta para um arquivo, não para uma pasta.", message: "Escolha outro caminho." }
        case "git": {
            const origin = repoFromRemote(marker(output, "ORIGIN") ?? "")
            if (origin === repo.toLowerCase()) return { kind: "clone", reason: null, message: "A pasta já é um clone deste repositório: será reaproveitada." }
            return { kind: "blocked", reason: origin ? `A pasta é um clone de outro repositório (${origin}).` : "A pasta é um repositório git sem o remoto deste repositório.", message: "Escolha outra pasta." }
        }
        case "other":
            return { kind: "blocked", reason: "A pasta já tem outros arquivos.", message: "Use uma pasta vazia, inexistente ou um clone deste repositório." }
        default:
            return { kind: "blocked", reason: "Não foi possível conferir a pasta no host.", message: "Confira o OpenCode e tente de novo." }
    }
}

// ── Fim da etapa 2 ────────────────────────────────────────────────────────────

export const DELIVERABLES = ["git", "origin", "push", "clean", "env", "envIgnored", "compose", "port", "portFree"] as const
export type Deliverable = (typeof DELIVERABLES)[number]

export const DELIVERABLE_LABELS: Record<Deliverable, string> = {
    git: "o diretório ser um repositório git com o remoto origin",
    origin: "o remoto origin apontar para o repositório deste bootstrap",
    push: "o push do último commit na branch",
    clean: "commitar todas as alterações (a árvore do git não está limpa)",
    env: "o arquivo .env",
    envIgnored: "o .env ignorado pelo git (.gitignore)",
    compose: "o docker-compose.yml",
    port: `a porta anotada em ${USED_PORTS_FILE} com o nome deste projeto (\`<porta> -> <repositório>\`)`,
    portFree: "a porta livre: outro container ou processo já escuta nela",
}

export interface VerificationTarget {
    directory: string
    branch: string
    port: number
    /** Nome do repositório: o rótulo esperado da reserva em `/home/used_ports`. */
    project: string
    /**
     * Projeto do compose do ambiente já criado para este bootstrap (`source.projectName`): o container dele roda em
     * outra pasta (a do ambiente) e pode seguir de pé depois de um deploy com falha — conta como próprio.
     */
    composeProject?: string | null
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Confere o remoto (impresso sem credenciais; a comparação com o repositório é em `missingDeliverables`),
 * o push, o `.env` (só a existência), o compose, a reserva da porta com o nome do projeto e se a porta
 * não está ocupada por outro container ou processo (um container deste diretório pode usá-la).
 */
export function verificationCommand(target: VerificationTarget): string {
    const { directory, branch, port, project, composeProject } = target
    const dir = shq(directory)
    const ref = shq(`refs/heads/${branch}`)
    const reservation = shq(`^[[:space:]]*${port}[[:space:]]*->[[:space:]]*${escapeRegex(project)}([[:space:]]|$)`)
    const published = shq(`:${port}->`)
    return [
        `cd ${dir} 2>/dev/null || { echo GIT=missing; exit 0; }`,
        `git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1 && echo GIT=ok || echo GIT=missing`,
        `echo "ORIGIN=$(git remote get-url origin 2>/dev/null | sed -E 's#//[^@/]*@#//#')"`,
        `LOCAL=$(git rev-parse HEAD 2>/dev/null); REMOTE=$(git ls-remote origin ${ref} 2>/dev/null | cut -f1)`,
        `[ -n "$LOCAL" ] && [ "$LOCAL" = "$REMOTE" ] && echo PUSH=ok || echo PUSH=missing`,
        `[ -z "$(git status --porcelain 2>/dev/null)" ] && echo CLEAN=ok || echo CLEAN=missing`,
        `[ -f .env ] && echo ENV=ok || echo ENV=missing`,
        `git check-ignore -q .env 2>/dev/null && echo ENVIGNORED=ok || echo ENVIGNORED=missing`,
        `[ -f docker-compose.yml ] && echo COMPOSE=ok || echo COMPOSE=missing`,
        `grep -Eiq ${reservation} ${shq(USED_PORTS_FILE)} 2>/dev/null && echo PORT=ok || echo PORT=missing`,
        `HERE=$(pwd -P)`,
        // Próprio: container deste diretório ou do ambiente deste bootstrap (projeto do compose); o resto é de outro projeto.
        `CONTAINERS=$(docker ps --format '{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.project.working_dir"}}|{{.Ports}}' 2>/dev/null | grep -F ${published})`,
        `OWN=$(printf '%s\\n' "$CONTAINERS" | awk -F'|' -v a=${dir} -v b="$HERE" -v p=${shq(composeProject ?? "")} 'NF && ($2==a || $2==b || (p!="" && $1==p))' | head -n1)`,
        `OTHER=$(printf '%s\\n' "$CONTAINERS" | awk -F'|' -v a=${dir} -v b="$HERE" -v p=${shq(composeProject ?? "")} 'NF && $2!=a && $2!=b && (p=="" || $1!=p)' | head -n1)`,
        `if [ -n "$OTHER" ]; then echo PORTFREE=missing; elif [ -z "$OWN" ] && ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq ':${port}$'; then echo PORTFREE=missing; else echo PORTFREE=ok; fi`,
    ].join("\n")
}

const MARKERS: Record<Exclude<Deliverable, "origin">, string> = { git: "GIT", push: "PUSH", clean: "CLEAN", env: "ENV", envIgnored: "ENVIGNORED", compose: "COMPOSE", port: "PORT", portFree: "PORTFREE" }

/** O que faltou (vazio = tudo entregue). Marcador ausente conta como faltando; o remoto precisa ser `repo`. */
export function missingDeliverables(output: string, repo: string): Deliverable[] {
    return DELIVERABLES.filter((item) => (item === "origin" ? repoFromRemote(marker(output, "ORIGIN") ?? "") !== repo.toLowerCase() : marker(output, MARKERS[item]) !== "ok"))
}

export const describeMissing = (missing: readonly Deliverable[]) => missing.map((item) => DELIVERABLE_LABELS[item])
