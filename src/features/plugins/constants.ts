/**
 * Vocabulário dos plugins do Opex (OPE-172). Módulo PURO (cliente e servidor).
 *
 * Plugins vivem no MongoDB, versionados (`draft` → `preview` → `stable`, com rollback), e estendem o
 * app em tempo de execução: os do dono têm código de servidor (kernel Cordis) e interface; os de
 * cliente são só interface no portal. Ver `aicontext/modules/plugins.md`.
 */

/** Versão do SDK (contrato entre o núcleo e os plugins). Major diferente = incompatível. */
export const PLUGIN_API_VERSION = "1.0"

export const PLUGIN_SCOPES = ["owner", "client"] as const
export type PluginScope = (typeof PLUGIN_SCOPES)[number]

export const PLUGIN_SCOPE_LABELS: Record<PluginScope, string> = {
    owner: "Dono",
    client: "Cliente",
}

export const PLUGIN_VERSION_STATES = ["draft", "preview", "stable", "archived"] as const
export type PluginVersionState = (typeof PLUGIN_VERSION_STATES)[number]

export const PLUGIN_VERSION_STATE_LABELS: Record<PluginVersionState, string> = {
    draft: "Rascunho",
    preview: "Prévia",
    stable: "Estável",
    archived: "Arquivada",
}

/** Canal de uma versão carregada: a consolidada (`stable`) ou a prévia de uma mesa. */
export const PLUGIN_CHANNELS = ["stable", "preview"] as const
export type PluginChannel = (typeof PLUGIN_CHANNELS)[number]

/**
 * Slots de interface. Os de menu (`sidebar.nav` no dono, `portal.nav` no portal) são declarativos:
 * vêm das entradas `nav` do manifesto, integradas ao menu; os demais montam componentes exportados
 * pelo bundle do cliente.
 */
export const OWNER_PLUGIN_SLOTS = ["dashboard.widgets", "sidebar.nav", "task.panel", "topbar.actions", "workbench.panel", "tasks.header", "financeiro.widgets"] as const
export const CLIENT_PLUGIN_SLOTS = ["portal.dashboard.widgets", "portal.task.panel", "portal.nav"] as const
export const PLUGIN_SLOTS = [...OWNER_PLUGIN_SLOTS, ...CLIENT_PLUGIN_SLOTS] as const
export type PluginSlotName = (typeof PLUGIN_SLOTS)[number]
/** Slots de menu: vêm da lista `nav` do manifesto, não de um componente. */
export const PLUGIN_NAV_SLOTS = ["sidebar.nav", "portal.nav"] as const
export type PluginNavSlot = (typeof PLUGIN_NAV_SLOTS)[number]
export const isPluginNavSlot = (slot: string): slot is PluginNavSlot => (PLUGIN_NAV_SLOTS as readonly string[]).includes(slot)
/** Slots que montam componentes (os de menu vêm do manifesto). */
export type PluginComponentSlot = Exclude<PluginSlotName, PluginNavSlot>
/** Slot de menu de cada escopo. */
export const PLUGIN_NAV_SLOT_BY_SCOPE: Record<PluginScope, PluginNavSlot> = { owner: "sidebar.nav", client: "portal.nav" }

export const PLUGIN_SLOTS_BY_SCOPE: Record<PluginScope, readonly PluginSlotName[]> = {
    owner: OWNER_PLUGIN_SLOTS,
    client: CLIENT_PLUGIN_SLOTS,
}

export const PLUGIN_SLOT_LABELS: Record<PluginSlotName, string> = {
    "dashboard.widgets": "Widgets do Dashboard",
    "sidebar.nav": "Menu lateral",
    "task.panel": "Aba da tarefa",
    "topbar.actions": "Barra superior",
    "workbench.panel": "Aba da mesa",
    "tasks.header": "Topo do quadro de tarefas",
    "financeiro.widgets": "Widgets do Financeiro",
    "portal.dashboard.widgets": "Widgets do Dashboard do portal",
    "portal.task.panel": "Aba da tarefa no portal",
    "portal.nav": "Menu do portal",
}

/** Serviços do núcleo que um plugin do dono pode injetar (Cordis `inject`). */
export const PLUGIN_SERVICES = ["db", "log", "audit", "realtime", "integrations", "ai", "tools", "cron", "routes", "kv", "sdk"] as const
export type PluginServiceName = (typeof PLUGIN_SERVICES)[number]

export const PLUGIN_ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const
export type PluginRouteMethod = (typeof PLUGIN_ROUTE_METHODS)[number]

/** Id do plugin: slug minúsculo (também é o segmento das rotas `/api/p/{id}` e das páginas `/x/{id}`). */
export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
/** Nome de ferramenta, cron ou chave declarada pelo plugin. */
export const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9_]{1,39}$/

/** Ferramentas registradas por plugins entram no catálogo com este prefixo. */
export const PLUGIN_TOOL_PREFIX = "plugin_"
export const pluginToolName = (pluginId: string, name: string) => `${PLUGIN_TOOL_PREFIX}${pluginId.replace(/-/g, "_")}_${name}`
export const isPluginToolName = (name: string) => name.startsWith(PLUGIN_TOOL_PREFIX)

/** Id da rotina de um cron de plugin no estado do agendador (`CronJobState`). */
export const pluginCronJobId = (pluginId: string, name: string) => `plugin:${pluginId}:${name}`

/** Evento Pusher (`private-app` e `private-client-{clientId}`): `{ id, version, channel }`. */
export const PLUGIN_UPDATED_EVENT = "plugin-updated"

/** Evento Pusher dos logs de debug (`private-plugin-{id}`): `{ entries }`, como as integrações. */
export const PLUGIN_DEBUG_EVENT = "plugin-debug"

/** Cookie (assinado) com os plugins cuja prévia está ligada neste navegador. */
export const PLUGIN_PREVIEW_COOKIE = "opex_plugin_preview"

export const PLUGINS_PATH = "/plugins"
export const pluginPath = (id: string) => `${PLUGINS_PATH}/${id}`
export const CLIENTE_PLUGINS_PATH = "/cliente/plugins"
/** Prefixo das páginas de plugin (dono: `/x/{id}/...`; portal: `/cliente/x/{id}/...`). */
export const PLUGIN_PAGE_PREFIX = "/x"
export const pluginPagePath = (pluginId: string, page: string) => `${PLUGIN_PAGE_PREFIX}/${pluginId}${page ? `/${page}` : ""}`
export const clientePluginPagePath = (pluginId: string, page: string) => `/cliente${pluginPagePath(pluginId, page)}`

/** Limites da versão (fontes guardadas no Mongo). */
export const PLUGIN_MAX_FILES = 200
export const PLUGIN_MAX_FILE_BYTES = 256 * 1024
export const PLUGIN_MAX_TOTAL_BYTES = 2 * 1024 * 1024

/** Pasta de trabalho de uma mesa Plugin (relativa à raiz dos worktrees da central). */
export const PLUGIN_WORKDIR_SEGMENT = "plugins"
/** Arquivos que não voltam para a versão (ambiente local do agente). */
export const PLUGIN_IGNORED_PREFIXES = ["node_modules/", ".opex-sdk/", ".git/", "dist/", "coverage/"] as const
/** Arquivos de ambiente na raiz da pasta (vêm do template do SDK). */
export const PLUGIN_ENVIRONMENT_FILES = ["package.json", "package-lock.json", "pnpm-lock.yaml", "tsconfig.json", "vitest.config.mts", ".gitignore"] as const

/** Tamanho máximo do descritivo da mudança de uma versão (caracteres). */
export const PLUGIN_CHANGE_SUMMARY_MAX = 2000
