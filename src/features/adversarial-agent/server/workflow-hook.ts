/**
 * Ponto de montagem do Agente Adversário no fluxo da mesa (`agentic/server/workflow.ts`, import
 * dinâmico). Tudo o que o fluxo da mesa usa do adversário passa por aqui.
 */
export { adversaryApplies } from "./settings"
export { runAdversaryRound, type AdversaryRoundInput, type AdversaryRoundOutcome } from "./review"
export { failOrphanReviews, prepareUserFix, recordRerun, recordSkip, removeWorkbenchReviewSessions, restoreAwaiting } from "./reviews"
