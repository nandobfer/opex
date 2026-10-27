/**
 * Permissões do Agente Adversário (módulo PURO). Ele só LÊ: nunca altera arquivos, nunca roda testes,
 * build, typecheck, lint ou instalação (o implementador já rodou tudo e está verde) e nunca mexe no
 * git além de ler. As regras vão na criação da sessão (a última que casa vale) e o mesmo critério
 * decide os pedidos que ainda chegarem (aprovados ou negados na hora — ninguém responde).
 */

/** Comandos proibidos (padrões do OpenCode, `*` = qualquer sufixo). */
export const ADVERSARIAL_DENIED_COMMANDS = [
    "pnpm *",
    "npm *",
    "npx *",
    "yarn *",
    "bun *",
    "bunx *",
    "deno *",
    "node *",
    "tsx *",
    "tsc*",
    "vitest*",
    "jest*",
    "eslint*",
    "prettier*",
    "biome*",
    "next *",
    "turbo *",
    "make*",
    "docker*",
    "podman*",
    "cargo *",
    "go test*",
    "go build*",
    "go vet*",
    "pytest*",
    "python -m pytest*",
    "mvn *",
    "gradle*",
    "./gradlew*",
    "dotnet *",
    "playwright*",
    "cypress*",
    "git add*",
    "git commit*",
    "git push*",
    "git pull*",
    "git merge*",
    "git rebase*",
    "git reset*",
    "git checkout*",
    "git switch*",
    "git restore*",
    "git stash*",
    "git clean*",
    "git cherry-pick*",
    "git revert*",
    "git tag*",
    "git worktree*",
    "git branch -*",
    "gh *",
    "rm *",
    "mv *",
    "cp *",
    "mkdir *",
    "touch *",
    "chmod *",
    "sed -i*",
    "tee *",
] as const

export interface PermissionRule {
    action: string
    resource: string
    effect: "allow" | "deny" | "ask"
}

/** Regras da sessão: nega edição e subagentes; comandos liberados, exceto os proibidos (vêm depois). */
export const ADVERSARIAL_SESSION_PERMISSIONS: readonly PermissionRule[] = [
    { action: "edit", resource: "*", effect: "deny" },
    { action: "task", resource: "*", effect: "deny" },
    { action: "bash", resource: "*", effect: "allow" },
    ...ADVERSARIAL_DENIED_COMMANDS.map((resource) => ({ action: "bash", resource, effect: "deny" as const })),
]

const WRITE_ACTIONS = new Set(["edit", "write", "patch", "multiedit", "task"])

/** `*` do padrão do OpenCode como curinga (casa o começo do comando, já sem espaços extras). */
function matches(pattern: string, command: string): boolean {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
    return new RegExp(`^${escaped}$`).test(command)
}

/** Segmentos de um comando composto (`a && b | c; d`), cada um conferido separadamente. */
function segments(command: string): string[] {
    return command
        .split(/&&|\|\||[;|\n]/)
        .map((part) => part.trim().replace(/^(?:sudo|env(?:\s+\w+=\S+)*|\w+=\S+)\s+/, "").trim())
        .filter(Boolean)
}

export function isDeniedCommand(command: string): boolean {
    return segments(command).some((segment) => ADVERSARIAL_DENIED_COMMANDS.some((pattern) => matches(pattern, segment)))
}

/** Decide um pedido de permissão: `reject` para escrita/proibidos, `once` para o resto (leitura). */
export function decidePermission(permission: { action: string; resources: readonly string[] }): "once" | "reject" {
    const action = permission.action.toLowerCase()
    if (WRITE_ACTIONS.has(action)) return "reject"
    if (action === "bash" && permission.resources.some(isDeniedCommand)) return "reject"
    return "once"
}
