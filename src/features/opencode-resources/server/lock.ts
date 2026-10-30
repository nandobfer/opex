/**
 * Serializa as mudanças na configuração do OpenCode (backup → gravação → reload), vindas da tela ou do
 * Agente Opex, para duas edições não disputarem o mesmo `opencode.jsonc`. Processo único (sem filas).
 */

const globalForLock = globalThis as unknown as { opencodeConfigLock?: { tail: Promise<unknown> } }
const state = (globalForLock.opencodeConfigLock ??= { tail: Promise.resolve() })

export function withConfigLock<T>(task: () => Promise<T>): Promise<T> {
    const run = state.tail.then(task, task)
    state.tail = run.catch(() => undefined)
    return run
}
