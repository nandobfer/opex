/**
 * Provisionamentos vivos neste processo (OPE-130), num módulo leve para o tick e o serviço consultarem
 * sem carregar o subagente. O estado "running"/"pending" no banco sem entrada aqui é obsoleto
 * (o servidor reiniciou no meio do provisionamento).
 */

const globalRegistry = globalThis as unknown as { __routineProvisioning?: Map<string, Promise<void>> }
export const inFlight: Map<string, Promise<void>> = (globalRegistry.__routineProvisioning ??= new Map())

/** Mensagem do provisionamento que ficou "em andamento" sem processo vivo (reinício do servidor). */
export const PROVISIONING_INTERRUPTED_MESSAGE = 'O provisionamento foi interrompido (o servidor reiniciou no meio dele). Use "Tentar de novo".'

/** Há um provisionamento vivo deste agente neste processo? */
export function isProvisioningInFlight(agentId: string): boolean {
    return inFlight.has(agentId)
}
