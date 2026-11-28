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

export const DELIVERABLES = ["git", "push", "clean", "env", "envIgnored", "compose", "port"] as const
export type Deliverable = (typeof DELIVERABLES)[number]

export const DELIVERABLE_LABELS: Record<Deliverable, string> = {
    git: "o diretório ser um repositório git com o remoto origin",
    push: "o push do último commit na branch",
    clean: "commitar todas as alterações (a árvore do git não está limpa)",
    env: "o arquivo .env",
    envIgnored: "o .env ignorado pelo git (.gitignore)",
    compose: "o docker-compose.yml",
    port: `a porta anotada em ${USED_PORTS_FILE}`,
}

/** Confere o push, o `.env` (só a existência), o compose e a porta anotada. */
export function verificationCommand(directory: string, branch: string, port: number): string {
    const dir = shq(directory)
    const ref = shq(`refs/heads/${branch}`)
    return [
        `cd ${dir} 2>/dev/null || { echo GIT=missing; exit 0; }`,
        `git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1 && echo GIT=ok || echo GIT=missing`,
        `LOCAL=$(git rev-parse HEAD 2>/dev/null); REMOTE=$(git ls-remote origin ${ref} 2>/dev/null | cut -f1)`,
        `[ -n "$LOCAL" ] && [ "$LOCAL" = "$REMOTE" ] && echo PUSH=ok || echo PUSH=missing`,
        `[ -z "$(git status --porcelain 2>/dev/null)" ] && echo CLEAN=ok || echo CLEAN=missing`,
        `[ -f .env ] && echo ENV=ok || echo ENV=missing`,
        `git check-ignore -q .env 2>/dev/null && echo ENVIGNORED=ok || echo ENVIGNORED=missing`,
        `[ -f docker-compose.yml ] && echo COMPOSE=ok || echo COMPOSE=missing`,
        `grep -Eq '^[[:space:]]*${port}[[:space:]]*->' ${shq(USED_PORTS_FILE)} 2>/dev/null && echo PORT=ok || echo PORT=missing`,
    ].join("\n")
}

const MARKERS: Record<Deliverable, string> = { git: "GIT", push: "PUSH", clean: "CLEAN", env: "ENV", envIgnored: "ENVIGNORED", compose: "COMPOSE", port: "PORT" }

/** O que faltou (vazio = tudo entregue). Marcador ausente conta como faltando. */
export function missingDeliverables(output: string): Deliverable[] {
    return DELIVERABLES.filter((item) => marker(output, MARKERS[item]) !== "ok")
}

export const describeMissing = (missing: readonly Deliverable[]) => missing.map((item) => DELIVERABLE_LABELS[item])
