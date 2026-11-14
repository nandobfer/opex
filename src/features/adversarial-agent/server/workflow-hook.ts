/**
 * Ponto de montagem do Agente Adversário no fluxo da mesa (`agentic/server/workflow.ts`, import
 * dinâmico). Tudo o que o fluxo da mesa usa do adversário passa por aqui (inclusive o Agente Mentor).
 */
export { adversaryApplies, adversaryModel } from "./settings"
export { runAdversaryRound, type AdversaryRoundInput, type AdversaryRoundOutcome } from "./review"
export { failOrphanReviews, prepareUserFix, recordRerun, recordSkip, removeWorkbenchReviewSessions, restoreAwaiting } from "./reviews"
export { mentorOnDone, type MentorOnDoneInput } from "./mentor/hooks"
