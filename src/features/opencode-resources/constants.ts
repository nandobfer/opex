/** Constantes dos recursos do OpenCode (skills, agentes, comandos, plugins e MCPs) — módulo puro. */

export const OPENCODE_RESOURCE_KINDS = ["skill", "agent", "command", "plugin", "mcp"] as const
export type OpencodeResourceKind = (typeof OPENCODE_RESOURCE_KINDS)[number]

export const OPENCODE_RESOURCE_KIND_LABELS: Record<OpencodeResourceKind, { one: string; many: string; article: "o" | "a" }> = {
    skill: { one: "skill", many: "Skills", article: "a" },
    agent: { one: "agente", many: "Agentes", article: "o" },
    command: { one: "comando", many: "Comandos", article: "o" },
    plugin: { one: "plugin", many: "Plugins", article: "o" },
    mcp: { one: "MCP", many: "MCPs", article: "o" },
}

/** Tipos criados à mão (plugins só por instalação). */
export const CREATABLE_KINDS = ["skill", "agent", "command", "mcp"] as const satisfies readonly OpencodeResourceKind[]
export type CreatableKind = (typeof CREATABLE_KINDS)[number]

/** Tipos instalados de repositório/pacote. */
export const INSTALLABLE_KINDS = ["skill", "plugin", "mcp"] as const satisfies readonly OpencodeResourceKind[]
export type InstallableKind = (typeof INSTALLABLE_KINDS)[number]

/** Evento em `private-app` quando os recursos mudam. Payload: `{ kind, scope }`. */
export const OPENCODE_RESOURCES_UPDATED_EVENT = "opencode-resources-updated"
/** Evento em `private-app` quando os backups mudam. Payload: `{}`. */
export const OPENCODE_BACKUPS_UPDATED_EVENT = "opencode-backups-updated"

export const OPENCODE_RESOURCE_AUDIT_ENTITY = "RecursoOpenCode"
export const OPENCODE_BACKUP_AUDIT_ENTITY = "BackupOpenCode"

/** Escopo global (usuário); projetos são `central:<id>`. */
export const GLOBAL_SCOPE = "global"

/** Backups mantidos no host (os mais antigos são apagados). */
export const OPENCODE_BACKUPS_KEEP = 50

/** Pasta (relativa ao $HOME do host) dos backups da configuração. */
export const OPENCODE_BACKUP_DIR = ".local/share/opencode/opex-backups"
/** Pasta (relativa ao $HOME do host) dos itens desligados e do manifesto. */
export const OPENCODE_DISABLED_DIR = ".config/opencode/.opex-disabled"

/** Nome de skill, agente, comando ou MCP: letras minúsculas, números, `-`, `_` e `.`. */
export const RESOURCE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

/** Cache da versão disponível (npm/GitHub). */
export const VERSION_CACHE_MS = 10 * 60_000

/** Teste de MCP (listar ferramentas pelo inspector no host). */
export const MCP_TEST_TIMEOUT_MS = 120_000
/** Instalação/atualização por CLI no host (`npx skills ...`). */
export const INSTALL_TIMEOUT_MS = 5 * 60_000
