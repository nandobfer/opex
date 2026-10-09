import { AuditLog, type AcaoAuditoria as AcaoAuditoriaTipo } from "@/lib/db/models/AuditLog"
import { loggerFor } from "@/lib/logger"

export interface RecordAuditInput {
    userId: string
    entidade: string
    entidadeId: string
    acao: AcaoAuditoriaTipo
    antes?: Record<string, unknown>
    depois?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
}

/**
 * Registra um evento de auditoria. Nunca lança: falha de auditoria é logada com Pino e não
 * derruba a operação já persistida.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
    try {
        await AuditLog.create({
            userId: input.userId,
            entidade: input.entidade,
            entidadeId: input.entidadeId,
            acao: input.acao,
            timestamp: new Date(),
            dadosAnteriores: input.antes,
            dadosNovos: input.depois,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
        })
    } catch (error) {
        loggerFor({ userId: input.userId }).error(
            { err: error, entidade: input.entidade, entidadeId: input.entidadeId, acao: input.acao },
            "Falha ao gravar auditoria",
        )
    }
}

/** Ações de auditoria como objeto (compatível com o código copiado do Smart Desk). */
export const AcaoAuditoria = {
    LOGIN: "LOGIN",
    LOGOUT: "LOGOUT",
    CRIAR: "CRIAR",
    ATUALIZAR: "ATUALIZAR",
    EXCLUIR: "EXCLUIR",
    MOVER: "MOVER",
    ATRIBUIR: "ATRIBUIR",
    APROVAR: "APROVAR",
    DEVOLVER: "DEVOLVER",
    ABORTAR: "ABORTAR",
    IMPORTAR: "IMPORTAR",
    OPT_OUT: "OPT_OUT",
    EXECUTAR: "EXECUTAR",
} as const satisfies Record<string, AcaoAuditoriaTipo>
