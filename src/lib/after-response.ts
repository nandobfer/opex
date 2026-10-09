import { after } from "next/server"
import { logger } from "@/lib/logger"

/**
 * Executa `task` depois de a resposta sair (`after()` do Next): funciona sem worker nem fila, Fora do escopo de uma requisição
 * (testes, scripts), executa em segundo plano na hora. Erros só vão para o log.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
    const safe = async () => {
        try {
            await task()
        } catch (error) {
            logger.error({ err: error, task: label }, "[after-response] Falha na tarefa em segundo plano")
        }
    }
    try {
        after(safe)
    } catch {
        void safe()
    }
}
