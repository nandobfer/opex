import type { HostRunner } from "@/features/local-docker/server/shell"

/**
 * Build da prévia rodado pelo app (etapa "Subindo a prévia"): o `docker compose … up -d --build` roda
 * desacoplado no host do OpenCode (segundo plano + consultas curtas, resistente ao OpenCode descartar o
 * shell) e cada trecho da saída chega em `onOutput` — é o que a aba Build mostra ao vivo. O mesmo
 * `jobId` reencontra o comando já iniciado (retomada depois de reiniciar o app).
 */

/** Intervalo entre as consultas da saída (a aba Build acompanha quase ao vivo). */
const POLL_MS = 700
const HEARTBEAT_MS = 30_000
/** Final da saída levado ao agente quando o build falha. */
const TAIL_LINES = 150
const TAIL_CHARS = 12_000

export interface PreviewBuildInput {
    /** Comando completo (entra no worktree e roda o compose). */
    run: string
    jobId: string
    timeoutMs: number
    signal: AbortSignal
    onOutput: (chunk: string) => void
    /** Sinal de vida da mesa enquanto o build roda (o turno do agente não está em andamento). */
    heartbeat?: () => Promise<void>
}

export interface PreviewBuildResult {
    /** `null` = o comando não terminou (cancelado, tempo esgotado ou sumiu do host). */
    exitCode: number | null
    /** Final da saída (onde ficam os erros). */
    tail: string
}

/** Últimas linhas de uma saída (sem os códigos de cor do terminal). */
export function outputTail(output: string, lines = TAIL_LINES, maxChars = TAIL_CHARS): string {
    const plain = output.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r(?!\n)/g, "\n")
    return plain.split("\n").slice(-lines).join("\n").slice(-maxChars).trim()
}

async function defaultRunner(): Promise<HostRunner> {
    return (await import("@/features/local-docker/server/shell")).runOnHost
}

export async function runPreviewBuild(input: PreviewBuildInput, runner?: HostRunner): Promise<PreviewBuildResult> {
    const run = runner ?? (await defaultRunner())
    const beat = input.heartbeat ? setInterval(() => void input.heartbeat?.().catch(() => undefined), HEARTBEAT_MS) : null
    beat?.unref?.()
    try {
        const result = await run(input.run, input.timeoutMs, { detached: true, jobId: input.jobId, pollMs: POLL_MS, signal: input.signal, onOutput: input.onOutput })
        return { exitCode: result.exitCode, tail: outputTail(result.output) }
    } finally {
        if (beat) clearInterval(beat)
    }
}
