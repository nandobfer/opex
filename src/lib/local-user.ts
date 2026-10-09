/**
 * Dono do app. O Opex é de uso pessoal, roda só localmente e não tem login: toda ação é
 * atribuída a este usuário fixo (auditoria, campos `createdBy`/`updatedBy`). SOMENTE servidor.
 */
export const LOCAL_USER_ID = "local"

export interface LocalUser {
    id: string
    name: string
}

export function getLocalUser(): LocalUser {
    return { id: LOCAL_USER_ID, name: process.env.APP_OWNER_NAME?.trim() || "Usuário local" }
}
