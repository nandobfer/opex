/** Recursos do servidor do OpenCode (CPU, RAM, swap e disco) — `aicontext/modules/host-metrics.md`. */

/** Evento em `private-app` com o DTO inteiro (números, estado e `checkedAt`); o cliente grava no cache. */
export const HOST_METRICS_UPDATED_EVENT = "host-metrics-updated"

export const HOST_METRICS_QUERY_KEY = "host-metrics"

/** RPC do plugin `opencode-htop` no `opencode serve` (o mesmo da TUI). */
export const HTOP_PLUGIN_ID = "opencode-htop"
export const HTOP_RPC_ID = "opencode-htop"
export const HTOP_RPC_METHOD = "stats"
export const HTOP_RPC_TIMEOUT_MS = 5_000

/** Validade da detecção do plugin (`plugin.list`); um erro do RPC marca ausente até expirar. */
export const HTOP_PLUGIN_CACHE_MS = 60_000

/** Fallback pelo shell do OpenCode (host): timeout do comando. */
export const HOST_METRICS_SHELL_TIMEOUT_MS = 10_000

/** Marcadores entre as partes da saída do comando de shell. */
export const SHELL_MARKERS = { meminfo: "@@meminfo", disk: "@@df", cores: "@@cores" } as const

/**
 * Comando fixo do fallback: duas amostras da linha `cpu` de `/proc/stat` (150 ms, como a 1ª leitura
 * do plugin), `/proc/meminfo`, `df` em bytes da raiz e o número de núcleos.
 */
export const HOST_METRICS_SHELL_COMMAND = [
    "head -n1 /proc/stat",
    "sleep 0.15",
    "head -n1 /proc/stat",
    `echo ${SHELL_MARKERS.meminfo}`,
    "cat /proc/meminfo",
    `echo ${SHELL_MARKERS.disk}`,
    "df -B1 -P /",
    `echo ${SHELL_MARKERS.cores}`,
    "getconf _NPROCESSORS_ONLN",
].join("; ")

/** Sem leitura boa há mais que isso, o painel marca "desatualizado" (ou `2 × intervalo + 5 s`, o maior). */
export const HOST_METRICS_STALE_MS = 30_000
export const HOST_METRICS_STALE_MARGIN_MS = 5_000

/** Mesmo sem mudança nos números, o servidor publica pelo menos nesse intervalo (mantém o "desatualizado" honesto). */
export const HOST_METRICS_HEARTBEAT_MS = 20_000

export const HOST_METRICS_MESSAGES = {
    unconfigured: "Configure o OpenCode em Integrações para ver os recursos do servidor.",
    error: "Não foi possível ler os recursos do servidor pelo OpenCode.",
} as const
