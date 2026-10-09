/** Token de sistema da API interna como a tela mostra (nunca o valor). */
export interface ApiTokenDto {
    id: string
    nome: string
    /** Começo visível do token (ex.: `mt_sys_AbCdEfGh`) para reconhecê-lo. */
    prefixo: string
    criadoEm: string
    ultimoUsoEm: string | null
}

/** Resposta da geração: o valor (`token`) só existe nesta resposta. */
export interface CreatedApiTokenDto {
    token: string
    item: ApiTokenDto
}
