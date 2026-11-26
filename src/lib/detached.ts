import { logger } from "@/lib/logger"

/**
 * Dispara `task` como tarefa solta do processo, sem prender à requisição (diferente de `runAfterResponse`): serve para
 * trabalho longo que continua depois de o usuário sair da tela. A continuidade entre processos fica com quem chama
 * (batimento no banco). Erros só vão para o log.
 */
export function runDetached(label: string, task: () => Promise<unknown>): void {
    void Promise.resolve().then(task).catch((error: unknown) => {
        logger.error({ err: error, task: label }, "[detached] Falha na tarefa em segundo plano")
    })
}
