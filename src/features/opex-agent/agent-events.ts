import { MADDOX_SESSION_DELETED_EVENT, MADDOX_SESSION_UPDATED_EVENT, OPEX_SESSION_DELETED_EVENT, OPEX_SESSION_UPDATED_EVENT } from "./constants"

/** Eventos de sessão de cada agente (mesmos canais; nomes próprios). */
export const AGENT_SESSION_EVENTS_BY_ID = {
    opex: { updated: OPEX_SESSION_UPDATED_EVENT, deleted: OPEX_SESSION_DELETED_EVENT },
    maddox: { updated: MADDOX_SESSION_UPDATED_EVENT, deleted: MADDOX_SESSION_DELETED_EVENT },
} as const
