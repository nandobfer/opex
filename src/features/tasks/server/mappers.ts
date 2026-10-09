import { goSipalTaskUrl, isTaskStatus, TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "../constants"
import type {
    NamedRef,
    PersonRef,
    TaskDetailDto,
    TaskDto,
    TaskImplementationPlan,
    TaskOptionsDto,
    WorkPackageRef,
} from "../types"

/**
 * Normaliza as respostas das rotas internas do Go! Sipal (`/api/dev-center/*`, documentos Mongo
 * com `populate`) para os DTOs do app. Tolerante: campo ausente ou de formato inesperado vira
 * `null`/vazio em vez de quebrar a tela. Somente servidor.
 */

type Raw = Record<string, unknown>

const isObj = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const iso = (value: unknown): string | null => {
    if (typeof value !== "string" && !(value instanceof Date)) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
const idOf = (value: unknown): string | null => {
    if (typeof value === "string" && value) return value
    if (isObj(value)) return str(value._id) ?? str(value.id)
    return null
}

function named(value: unknown, nameKey = "name"): NamedRef | null {
    if (!isObj(value)) return null
    const id = idOf(value)
    if (!id) return null
    return { id, name: str(value[nameKey]) ?? "—" }
}

function person(value: unknown): PersonRef | null {
    const ref = named(value)
    if (!ref || !isObj(value)) return null
    return { ...ref, email: str(value.email) }
}

function workPackage(value: unknown): WorkPackageRef | null {
    const ref = named(value)
    if (!ref || !isObj(value)) return null
    return { ...ref, startDate: iso(value.startDate), endDate: iso(value.endDate) }
}

export function toTaskDto(raw: unknown): TaskDto | null {
    if (!isObj(raw)) return null
    const id = idOf(raw)
    const status = raw.status
    if (!id || !isTaskStatus(status)) return null
    const priority = TASK_PRIORITIES.includes(raw.priority as TaskPriority) ? (raw.priority as TaskPriority) : "medium"
    const taskType = TASK_TYPES.includes(raw.taskType as TaskType) ? (raw.taskType as TaskType) : null
    return {
        id,
        code: str(raw.taskId) ?? id.slice(-6).toUpperCase(),
        title: str(raw.title) ?? "(sem título)",
        status,
        order: num(raw.order) ?? 0,
        taskType,
        priority,
        product: named(raw.product),
        workPackage: workPackage(raw.workPackage),
        assignee: person(raw.assignee),
        commitUrl: str(raw.commitUrl),
        pullRequestUrl: str(raw.pullRequestUrl),
        archived: raw.isArchived === true,
        createdAt: iso(raw.createdAt),
        updatedAt: iso(raw.updatedAt),
        localColumn: null,
        localOrder: null,
    }
}

export function toTaskList(raw: unknown): TaskDto[] {
    return arr(raw)
        .map(toTaskDto)
        .filter((task): task is TaskDto => task !== null)
}

function implementationPlan(value: unknown): TaskImplementationPlan | null {
    if (!isObj(value)) return null
    const steps = arr(value.steps).map(str).filter((step): step is string => step !== null)
    const relatedFiles = arr(value.relatedFiles).map(str).filter((file): file is string => file !== null)
    const complexity = ["low", "medium", "high"].includes(value.estimatedComplexity as string) ? (value.estimatedComplexity as "low" | "medium" | "high") : null
    if (!steps.length && !relatedFiles.length && !complexity) return null
    return { steps, relatedFiles, complexity, generatedAt: iso(value.generatedAt), generatedBy: named(value.generatedBy) }
}

export function toTaskDetailDto(raw: unknown, baseUrl: string): TaskDetailDto | null {
    const task = toTaskDto(raw)
    if (!task || !isObj(raw)) return null
    const linkedRequest = isObj(raw.linkedRequest) ? { code: str(raw.linkedRequest.requestId) ?? "—", title: str(raw.linkedRequest.title) } : null
    const improvement = isObj(raw.linkedImprovement) ? raw.linkedImprovement : null
    const fase1 = improvement && isObj(improvement.fase1) ? improvement.fase1 : null
    return {
        ...task,
        description: str(raw.description),
        technicalSpec: str(raw.technicalSpec),
        businessContext: str(raw.businessContext),
        acceptanceCriteria: arr(raw.acceptanceCriteria).map(str).filter((item): item is string => item !== null),
        createdBy: named(raw.createdBy),
        linkedRequest,
        linkedImprovement: improvement ? { code: str(improvement.improvementId) ?? "—", title: fase1 ? str(fase1.titulo) : null } : null,
        implementationPlan: implementationPlan(raw.implementationPlan),
        comments: arr(raw.comments)
            .filter(isObj)
            .map((comment, index) => ({
                id: idOf(comment) ?? `comment-${index}`,
                content: str(comment.content) ?? "",
                author: person(comment.author),
                createdAt: iso(comment.createdAt),
            })),
        history: arr(raw.history)
            .filter(isObj)
            .map((entry, index) => ({
                id: idOf(entry) ?? `history-${index}`,
                action: str(entry.action) ?? "updated",
                description: str(entry.description) ?? "",
                performedBy: named(entry.performedBy),
                createdAt: iso(entry.createdAt),
            }))
            .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
        attachments: arr(raw.attachments)
            .filter(isObj)
            .map((file, index) => ({
                id: idOf(file) ?? `file-${index}`,
                name: str(file.originalName) ?? str(file.fileName) ?? "arquivo",
                size: num(file.size),
                createdAt: iso(file.createdAt),
            })),
        timeLogs: arr(raw.timeLogs)
            .filter(isObj)
            .map((log, index) => ({
                id: idOf(log) ?? `log-${index}`,
                user: person(log.user),
                startTime: iso(log.startTime),
                endTime: iso(log.endTime),
                duration: num(log.duration),
                description: str(log.description),
                active: log.isActive === true,
            })),
        totalTimeLogged: num(raw.totalTimeLogged) ?? 0,
        platformUrl: goSipalTaskUrl(baseUrl, task.id),
    }
}

export function toTaskOptions(products: unknown, developers: unknown): Omit<TaskOptionsDto, "currentUserId"> {
    const byName = <T extends NamedRef>(a: T, b: T) => a.name.localeCompare(b.name, "pt-BR")
    return {
        products: arr(products)
            .map((item) => named(item))
            .filter((item): item is NamedRef => item !== null)
            .sort(byName),
        developers: arr(developers)
            .map(person)
            .filter((item): item is PersonRef => item !== null)
            .sort(byName),
    }
}
