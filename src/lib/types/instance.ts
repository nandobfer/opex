/** Identidade da instância para a interface (OPE-147). */
export interface InstanceInfoDto {
    /** Prévia do Opex (mesa publicada pelo `/desenvolvimento`): o agendador automático fica desligado. */
    preview: boolean
    /** Aviso exibido em Crons e em Rotineiros só na prévia. */
    schedulerMessage: string | null
}
