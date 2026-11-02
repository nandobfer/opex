/**
 * Ponto de montagem do Agente Arquiteto no fluxo da mesa (`agentic/server/workflow.ts`, import
 * dinâmico): o plano pronto (gatilho), a aprovação (reserva), a exclusão da mesa e o estado do DTO.
 */
export { cleanupWorkbenchDiagrams, onPlanApproved, onPlanReady, workbenchArchitect } from "./diagrams"
