/**
 * Dono do app. O Opex é de uso pessoal, protegido por um login com senha única (sem usuários):
 * toda ação é atribuída a este usuário fixo (auditoria, campos `createdBy`/`updatedBy`). SOMENTE
 * servidor.
 */
export const LOCAL_USER_ID = "local"

export interface LocalUser {
    id: string
    name: string
}

export function getLocalUser(): LocalUser {
    return { id: LOCAL_USER_ID, name: process.env.APP_OWNER_NAME?.trim() || "Usuário local" }
}
