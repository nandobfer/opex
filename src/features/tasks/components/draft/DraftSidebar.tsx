"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { CalendarClock, FolderKanban, Package, RotateCcw, Shapes, Tag, UserRound, UserPen } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fadeUp } from "@/components/motion/presets"
import { GithubUserLabel } from "@/features/github/components/shared"
import type { DraftField } from "@/features/github/schemas"
import type { TaskDraftDetailDto } from "@/features/github/types"
import { formatDateTime } from "../../format"
import { TASK_TYPE_LABELS, TASK_TYPES, type TaskType } from "../../constants"
import { useUpdateDraft } from "../../hooks/useDrafts"
import type { PersonRef } from "../../types"
import { TaskAssigneePicker } from "../TaskAssigneePicker"
import { TaskPriorityMenu } from "../TaskPriorityMenu"

const NO_PACKAGE = "__none__"

function Row({ icon: Icon, label, origin, onRestore, children }: { icon: typeof Tag; label: string; origin?: string; onRestore?: () => void; children: ReactNode }) {
    return (
        <div className="flex items-start gap-2.5 py-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
                <dt className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {label}
                    {onRestore && (
                        <button type="button" onClick={onRestore} className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-primary hover:underline">
                            <RotateCcw className="h-3 w-3" aria-hidden /> da issue
                        </button>
                    )}
                </dt>
                <dd className="mt-0.5 break-words text-sm">{children}</dd>
                {origin && <p className="mt-0.5 text-[11px] text-muted-foreground">{origin === "editado" ? "Editado aqui" : `Da issue: ${origin}`}</p>}
            </div>
        </div>
    )
}

interface DraftSidebarProps {
    draft: TaskDraftDetailDto
    people: readonly PersonRef[]
    currentUserId: string | null
}

/** Propriedades do rascunho: campos mapeados da issue (editáveis, com a origem) e dados da issue. */
export function DraftSidebar({ draft, people, currentUserId }: DraftSidebarProps) {
    const update = useUpdateDraft(draft.id)
    const restore = (field: DraftField) => (draft.edited.includes(field) ? () => update.mutate({ restore: [field] }) : undefined)
    return (
        <motion.aside variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.05 }}>
            <Card>
                <CardContent className="divide-y pt-4">
                    <dl>
                        <Row icon={UserRound} label="Responsável" origin={draft.origins.assignee} onRestore={restore("assignee")}>
                            <TaskAssigneePicker value={draft.assignee} people={people} currentUserId={currentUserId} pending={update.isPending} onChange={(assignee) => update.mutate({ assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null })} />
                        </Row>
                        <Row icon={Tag} label="Prioridade" origin={draft.origins.priority} onRestore={restore("priority")}>
                            <TaskPriorityMenu value={draft.priority} pending={update.isPending} onChange={(priority) => update.mutate({ priority })} />
                        </Row>
                        <Row icon={Shapes} label="Tipo" origin={draft.origins.taskType} onRestore={restore("taskType")}>
                            <Select value={draft.taskType} onValueChange={(value) => update.mutate({ taskType: value as TaskType })}>
                                <SelectTrigger className="h-8 w-full" aria-label="Tipo">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TASK_TYPES.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {TASK_TYPE_LABELS[value]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Row>
                        <Row icon={FolderKanban} label="Produto">
                            {draft.product.name}
                        </Row>
                        <Row icon={Package} label="Pacote de trabalho" origin={draft.origins.workPackage} onRestore={restore("workPackage")}>
                            <Select
                                value={draft.workPackage?.id ?? NO_PACKAGE}
                                onValueChange={(value) => update.mutate({ workPackage: value === NO_PACKAGE ? null : (draft.workPackages.find((item) => item.id === value) ?? null) })}
                            >
                                <SelectTrigger className="h-8 w-full" aria-label="Pacote de trabalho">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_PACKAGE}>Sem pacote</SelectItem>
                                    {(draft.workPackages.length ? draft.workPackages : draft.workPackage ? [draft.workPackage] : []).map((item) => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Row>
                        <Row icon={Tag} label="Na issue">
                            <span className="block text-xs text-muted-foreground">
                                {draft.issueType ? `Issue Type: ${draft.issueType} · ` : ""}
                                {draft.labels.length ? `Labels: ${draft.labels.join(", ")}` : "Sem labels"}
                                {draft.milestone ? ` · Milestone: ${draft.milestone}` : ""}
                            </span>
                            {draft.assignees.length > 0 && <span className="block text-xs text-muted-foreground">Assignees: {draft.assignees.map((login) => `@${login}`).join(", ")}</span>}
                            {draft.issueState === "closed" && <span className="mt-1 block text-xs text-warning">Issue fechada{draft.issueStateReason === "not_planned" ? " como não planejada" : ""}</span>}
                        </Row>
                        <Row icon={UserPen} label="Aberta por">
                            <GithubUserLabel login={draft.author.login} name={draft.author.name} avatarUrl={draft.author.avatarUrl} />
                            <span className="block text-xs text-muted-foreground">{formatDateTime(draft.issueCreatedAt)}</span>
                        </Row>
                        <Row icon={CalendarClock} label="Rascunho atualizado">
                            {formatDateTime(draft.updatedAt)}
                            {draft.columnName && <span className="block text-xs text-muted-foreground">Coluna: {draft.columnName}</span>}
                        </Row>
                    </dl>
                </CardContent>
            </Card>
        </motion.aside>
    )
}
