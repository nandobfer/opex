import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { Project } from "@/lib/db/models/Project"
import { getClientServiceRow } from "@/features/services/server/service"
import { countServiceAttachments } from "@/features/tasks/attachments/server/service"
import type { ClienteServiceDto } from "../types"

/**
 * Detalhe de um serviço na visão do **cliente** (SOMENTE servidor): descrição, anexos e o
 * custo/horas infladas. Nunca expõe horas reais, fator, custo/hora ou modelo. Um serviço de outro
 * cliente responde 404 (não revela existência).
 */
export async function getClientServiceDetail(clientId: string, id: string): Promise<ClienteServiceDto> {
    await dbConnect()
    const service = await getClientServiceRow(clientId, id)
    if (!service) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    const project = service.projectId ? await Project.findById(service.projectId).select({ repo: 1 }).lean() : null
    return {
        id: String(service._id),
        code: service.code,
        title: service.title ?? null,
        summary: service.summary ?? null,
        description: service.description,
        repo: project?.repo ?? null,
        projectId: service.projectId,
        serviceDate: new Date(service.serviceDate).toISOString(),
        clientHours: service.clientHours,
        billingBrl: service.billingBrl,
        attachmentsCount: await countServiceAttachments(String(service._id)),
    }
}
