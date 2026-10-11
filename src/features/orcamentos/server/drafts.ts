import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { OrcamentoClient, OrcamentoDraft, type IOrcamentoDraft } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { listGithubRepos } from "@/features/github/server/lookups"
import type { GithubRepoOption } from "@/features/github/types"
import type { ProjectRef } from "@/features/tasks/types"
import { computeClientEstimate, roundHours } from "../logic"
import type { ClienteRepoDto, DraftEstimateDto, DraftPreviewDto, OrcamentoDraftDto } from "../types"
import { resolveTagViews } from "./tag-views"
import type { ClienteOrcamentoDoc } from "./token"

/**
 * Rascunhos de Orçamentos (SOMENTE servidor), compartilhados pelo **portal do cliente** e pela
 * **prévia do dono** (`/tarefas/previa`). Um rascunho pertence a um **escopo**:
 * - `client`: pedido pelo cliente no portal (filtro por `clientId`);
 * - `owner`: aberto pelo dono (`clientId: null`), que pode escolher um cliente **opcional** para o
 *   cálculo do custo (`estimateClientId`).
 *
 * A autenticação (token do cliente ou sessão), a criação e a aprovação ficam nos serviços de cada
 * escopo (`portal.ts` / `owner.ts`); aqui vive tudo o que é agnóstico de cliente.
 */

export type DraftScope = { kind: "client"; clientId: string; name: string } | { kind: "owner" }

export type DraftDoc = IOrcamentoDraft & { _id: unknown }

const OBJECT_ID = /^[a-f0-9]{24}$/i

/** Escopo de um rascunho do portal, a partir do cliente autenticado. */
export const clientScope = (client: ClienteOrcamentoDoc): DraftScope => ({ kind: "client", clientId: String(client._id), name: client.name })

/** Escopo do rascunho aberto pelo dono. */
export const OWNER_SCOPE: DraftScope = { kind: "owner" }

/** Filtro Mongo que isola o rascunho no escopo (o dono não alcança rascunhos de clientes e vice-versa). */
export const filterOf = (scope: DraftScope): Record<string, unknown> => (scope.kind === "client" ? { clientId: scope.clientId } : { clientId: null })

/** Identificador do rascunho para o rastro de uso de IA (não confunde dono e cliente). */
export const scopeSubject = (scope: DraftScope, draftId: string): string => (scope.kind === "client" ? `${scope.clientId}:${draftId}` : `owner:${draftId}`)

/** Título do registro de uso de IA (identifica o dono do rascunho). */
export const scopeTitle = (scope: DraftScope, projectName: string): string => (scope.kind === "client" ? `Orçamento ${scope.name}` : `Prévia — ${projectName}`)

/**
 * Índice `owner/repo` (minúsculo) → repositório do GitHub, best-effort: sem token configurado ou
 * com a API fora, o rascunho segue funcionando com o rótulo sem avatar (o `GithubRepoLabel` cai na
 * inicial). O resultado do `listGithubRepos` já é cacheado por 5 min.
 */
export async function githubRepoIndex(): Promise<Map<string, GithubRepoOption>> {
    try {
        return new Map((await listGithubRepos()).map((repo) => [repo.fullName, repo]))
    } catch {
        return new Map()
    }
}

/** Projeto + dados do GitHub (avatar, descrição e privacidade) para o `GithubRepoLabel`. */
export function withGithubData(project: ProjectRef, index: Map<string, GithubRepoOption>): ClienteRepoDto {
    const repo = index.get(project.repo.toLowerCase())
    return { ...project, ownerAvatarUrl: repo?.ownerAvatarUrl ?? null, description: repo?.description ?? null, private: repo?.private ?? false }
}

/** Prévia do rascunho no formato de exibição (sem a clareza, que é transitória). */
export function previewOfDraft(draft: DraftDoc): DraftPreviewDto | null {
    const preview = draft.preview
    if (!preview) return null
    return {
        title: preview.title,
        taskType: (preview.taskType as DraftPreviewDto["taskType"]) ?? null,
        priority: preview.priority as DraftPreviewDto["priority"],
        technicalSpec: preview.technicalSpec,
        summary: preview.summary,
        tags: preview.tags ?? [],
    }
}

/** Cliente do rascunho: o que pediu a tarefa (portal) ou o escolhido pelo dono para o custo. */
export async function resolveDraftClient(draft: Pick<DraftDoc, "clientId" | "estimateClientId">): Promise<ClienteOrcamentoDoc | null> {
    const id = draft.clientId ?? draft.estimateClientId ?? null
    if (!id || !OBJECT_ID.test(id)) return null
    await dbConnect()
    return (await OrcamentoClient.findById(id).lean()) as ClienteOrcamentoDoc | null
}

/** Estimativa do rascunho: horas reais sempre; custo só quando há cliente resolvido. */
export function estimateOfDraft(draft: Pick<DraftDoc, "estimatedHours">, client: ClienteOrcamentoDoc | null): DraftEstimateDto | null {
    const hours = typeof draft.estimatedHours === "number" ? draft.estimatedHours : null
    if (hours === null) return null
    if (!client) return { hours: roundHours(hours), clientHours: null, billingBrl: null }
    const estimate = computeClientEstimate(hours, client.profitFactor, client.hourlyRate)
    return { hours: estimate.hours, clientHours: estimate.clientHours, billingBrl: estimate.billingBrl }
}

/** Rascunho no formato que o cliente e o dono consomem. */
export async function draftToDto(draft: DraftDoc): Promise<OrcamentoDraftDto> {
    const preview = previewOfDraft(draft)
    const client = await resolveDraftClient(draft)
    const [project, index, tags] = await Promise.all([Project.findById(draft.projectId).lean(), githubRepoIndex(), resolveTagViews(preview?.tags ?? [])])
    return {
        id: String(draft._id),
        projectId: draft.projectId,
        projectName: project?.name ?? null,
        projectRepo: project ? withGithubData({ id: String(project._id), name: project.name, repo: project.repo, sigla: project.sigla }, index) : null,
        description: draft.description,
        correction: draft.correction ?? null,
        preview,
        tags,
        model: draft.model ?? null,
        status: draft.status,
        taskId: draft.taskId ?? null,
        estimate: estimateOfDraft(draft, client),
        estimateClientId: draft.estimateClientId ?? null,
        estimateClientName: client?.name ?? null,
        createdAt: draft.createdAt ? new Date(draft.createdAt).toISOString() : null,
    }
}

/** Documento do rascunho no escopo (uso interno do servidor). */
export async function getDraftDoc(scope: DraftScope, id: string): Promise<DraftDoc> {
    await dbConnect()
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    const draft = (await OrcamentoDraft.findOne({ _id: id, ...filterOf(scope) }).lean()) as DraftDoc | null
    if (!draft) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    return draft
}

/** Rascunho no escopo, no formato de exibição. */
export async function getDraft(scope: DraftScope, id: string): Promise<OrcamentoDraftDto> {
    return draftToDto(await getDraftDoc(scope, id))
}

/** Exige um rascunho em edição (409 se já aprovado). */
export function assertDraftEditable(draft: DraftDoc): void {
    if (draft.status !== "draft") throw new DomainError(409, "Este rascunho já foi aprovado", "DRAFT_APPROVED")
}

export async function setDraftCorrection(scope: DraftScope, id: string, correction: string): Promise<OrcamentoDraftDto> {
    const draft = await getDraftDoc(scope, id)
    assertDraftEditable(draft)
    await OrcamentoDraft.updateOne({ _id: draft._id }, { $set: { correction } })
    return draftToDto({ ...draft, correction })
}

/**
 * Grava a prévia gerada pela IA (chamado ao fim do stream). Zera a estimativa e as tags.
 * A avaliação de clareza é **transitória** (vive só na tela): é removida antes de persistir.
 */
export async function saveDraftPreview(scope: DraftScope, id: string, preview: Omit<DraftPreviewDto, "tags">): Promise<OrcamentoDraftDto> {
    await getDraftDoc(scope, id)
    const { clarity, ...persisted } = preview
    void clarity
    await OrcamentoDraft.updateOne({ _id: id }, { $set: { preview: { ...persisted, tags: [] }, estimatedHours: null } })
    return getDraft(scope, id)
}

/** Grava as tags do rascunho (geradas pela feature "Tags de tarefas") na prévia existente. */
export async function saveDraftTags(scope: DraftScope, id: string, tags: string[]): Promise<void> {
    const draft = await getDraftDoc(scope, id)
    if (!draft.preview) throw new DomainError(409, "Gere a prévia antes de classificar", "DRAFT_WITHOUT_PREVIEW")
    await OrcamentoDraft.updateOne({ _id: draft._id }, { $set: { "preview.tags": tags } })
}

/** Grava as horas reais (H) e o modelo que as gerou; devolve a estimativa com o cliente do rascunho. */
export async function saveDraftEstimate(scope: DraftScope, id: string, estimatedHours: number, model: string | null): Promise<DraftEstimateDto> {
    const draft = await getDraftDoc(scope, id)
    await OrcamentoDraft.updateOne({ _id: draft._id }, { $set: { estimatedHours, model } })
    const estimate = estimateOfDraft({ estimatedHours }, await resolveDraftClient(draft))
    return estimate ?? { hours: roundHours(estimatedHours), clientHours: null, billingBrl: null }
}

/**
 * Recalcula o custo SEM IA, reusando as horas e o modelo já gravados e o cliente do rascunho. É o
 * caminho usado quando o dono escolhe/troca/limpa o cliente da estimativa.
 */
export async function recomputeDraftEstimate(scope: DraftScope, id: string): Promise<DraftEstimateDto> {
    const draft = await getDraftDoc(scope, id)
    const estimate = estimateOfDraft(draft, await resolveDraftClient(draft))
    if (!estimate) throw new DomainError(409, "Gere a estimativa antes de calcular o custo", "DRAFT_WITHOUT_ESTIMATE")
    return estimate
}

/**
 * Define, troca ou limpa o cliente usado no **cálculo do custo** da estimativa (`estimateClientId`).
 * Só aceita cliente **ativo** que inclua o repositório do rascunho (mesma regra do cliente da
 * tarefa). Só faz sentido para o rascunho do dono; o portal usa o `clientId` do próprio pedido.
 */
export async function setDraftEstimateClient(scope: DraftScope, id: string, clientId: string | null): Promise<void> {
    const draft = await getDraftDoc(scope, id)
    assertDraftEditable(draft)
    const filter = { _id: draft._id }
    if (clientId === null) {
        await OrcamentoDraft.updateOne(filter, { $set: { estimateClientId: null } })
        return
    }
    const client = await OrcamentoClient.findById(clientId).lean()
    if (!client) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
    if (client.active === false) throw new DomainError(400, "O cliente está inativo", "CLIENT_INACTIVE")
    if (!(client.projectIds ?? []).includes(draft.projectId)) throw new DomainError(400, "O cliente não inclui o repositório do rascunho", "CLIENT_NOT_FOR_PROJECT")
    await OrcamentoDraft.updateOne(filter, { $set: { estimateClientId: String(client._id) } })
}
