import { goSipalRequest } from "@/features/go-sipal/client"
import { toTaskDto } from "@/features/tasks/server/mappers"
import type { TaskDto } from "@/features/tasks/types"
import { repoFromUrl } from "../logic"

/**
 * Chamadas ao Go! Sipal usadas pela integração GitHub (rotas internas conferidas em
 * `~/code/sap-painel-lancamento`: `POST /api/dev-center/tasks`, anexos e pacotes). Somente servidor.
 */

type Raw = Record<string, unknown>
const isObj = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)
const idOf = (item: Raw): string | null => str(item._id) ?? str(item.id)
const list = (body: { data?: unknown } | null | undefined): Raw[] => (Array.isArray(body?.data) ? (body.data as unknown[]).filter(isObj) : [])

export interface GoProductOption {
    id: string
    name: string
    /** Repositório GitHub do `repositoryUrl` do produto (sugestão no vínculo). */
    repo: string | null
}

export async function listGoProducts(): Promise<GoProductOption[]> {
    const body = await goSipalRequest<{ data?: unknown }>("/api/dev-center/products", { label: "listar produtos" })
    return list(body)
        .map((item) => {
            const id = idOf(item)
            return id ? { id, name: str(item.name) ?? "—", repo: repoFromUrl(str(item.repositoryUrl)) } : null
        })
        .filter((item): item is GoProductOption => item !== null)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

export interface GoDeveloper {
    id: string
    name: string
    email: string | null
}

export async function listGoDevelopers(): Promise<GoDeveloper[]> {
    const body = await goSipalRequest<{ data?: unknown }>("/api/dev-center/developers", { label: "listar desenvolvedores" })
    return list(body)
        .map((item) => {
            const id = idOf(item)
            return id ? { id, name: str(item.name) ?? "—", email: str(item.email) } : null
        })
        .filter((item): item is GoDeveloper => item !== null)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

export async function listGoWorkPackages(productId: string): Promise<{ id: string; name: string }[]> {
    const body = await goSipalRequest<{ data?: unknown }>(`/api/dev-center/work-packages?productId=${encodeURIComponent(productId)}&excludeDelivered=true`, { label: "listar pacotes" })
    return list(body)
        .map((item) => {
            const id = idOf(item)
            return id ? { id, name: str(item.name) ?? "—" } : null
        })
        .filter((item): item is { id: string; name: string } => item !== null)
}

/** Tarefa do produto com os textos (para achar quem já cita a issue). */
export interface GoTaskText {
    task: TaskDto
    text: string
}

export async function listGoProductTasks(productId: string): Promise<GoTaskText[]> {
    const body = await goSipalRequest<{ data?: unknown }>(`/api/dev-center/tasks?productId=${encodeURIComponent(productId)}&includeArchived=true`, { label: "tarefas do produto" })
    return list(body)
        .map((raw) => {
            const task = toTaskDto(raw)
            return task ? { task, text: [raw.title, raw.description, raw.technicalSpec, raw.commitUrl, raw.pullRequestUrl].filter((part) => typeof part === "string").join("\n") } : null
        })
        .filter((item): item is GoTaskText => item !== null)
}

export interface CreateGoTaskBody {
    title: string
    description: string
    product: string
    status: string
    taskType: string
    priority: string
    assignee?: string
    workPackage?: string
}

export async function createGoTask(body: CreateGoTaskBody): Promise<TaskDto | null> {
    const response = await goSipalRequest<{ data?: unknown }>("/api/dev-center/tasks", { method: "POST", body, label: "criar tarefa" })
    return toTaskDto(response?.data)
}

export async function uploadGoAttachment(taskId: string, file: { name: string; type: string; bytes: ArrayBuffer }): Promise<void> {
    const form = new FormData()
    form.append("file", new Blob([file.bytes], { type: file.type }), file.name)
    await goSipalRequest(`/api/dev-center/tasks/${taskId}/attachments`, { method: "POST", formData: form, label: "anexar imagem" })
}

export async function updateGoTaskDescription(taskId: string, description: string): Promise<void> {
    await goSipalRequest(`/api/dev-center/tasks/${taskId}`, { method: "PUT", body: { description }, label: "atualizar descrição" })
}
