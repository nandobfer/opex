/** Contrato do histórico de repositórios usados recentemente (dono e portal). */
export interface RepoRecentsDto {
    /** Ids dos repositórios, do **mais recente** para o mais antigo; só os que o ator pode usar. */
    projectIds: string[]
    /** Canal privado em que o servidor publica as mudanças deste ator (`private-repo-recents-{ator}`). */
    channel: string
}
