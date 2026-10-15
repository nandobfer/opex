"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { FormFooter } from "@/components/ui/form-footer"
import { Input } from "@/components/ui/input"
import { MarkdownField } from "@/components/ui/markdown-field"
import { SearchPicker } from "@/components/ui/search-picker"
import { useRepoIndex, repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { formatFactorLabel } from "@/features/orcamentos/logic"
import { useOrcamentoClients } from "@/features/orcamentos/hooks/useOrcamentos"
import { orderByRecency } from "@/features/repository-recency/ordering"
import { useOwnerRepoRecents } from "@/features/repository-recency/hooks"
import { PendingAttachmentsField } from "@/features/tasks/attachments/components/PendingAttachmentsField"
import { useOwnerAttachmentClient, usePendingAttachments } from "@/features/tasks/attachments/hooks"
import { useTaskList, useTaskOptions } from "@/features/tasks/hooks/useTasks"
import type { ProjectRef } from "@/features/tasks/types"
import { formatBillingBrl, formatHours } from "@/features/finance/format"
import { SERVICES_PATH, serviceDetailPath } from "../constants"
import { computeServiceAmounts, todayDateInput } from "../logic"
import { fetchTaskForService, useCreateService, useUpdateService } from "../hooks"
import { serviceFormSchema, type ServiceFormValues, type ServiceWriteInput } from "../schemas"
import type { ServiceDto } from "../types"
import { ServiceAiPanel } from "./ServiceAiPanel"
import { ServiceAmountsFields, type ServiceAmountValues } from "./ServiceAmountsFields"

/**
 * Formulário de **criação/edição** de um serviço (`/financeiro/servicos/novo` e `.../[id]/editar`):
 * tela única com cliente (obrigatório), repositório e tarefa (opcionais; escolher a tarefa preenche
 * cliente e repositório dela), descrição (Markdown com uploads), anexos, data do serviço (default
 * hoje) e os três campos reativos. Salvar volta para `/financeiro` (criação) ou para o detalhe.
 */
export function ServiceForm({ service }: { service?: ServiceDto }) {
    const router = useRouter()
    const repoIndex = useRepoIndex()
    const clientsQuery = useOrcamentoClients()
    const projectsQuery = useTaskOptions()
    const tasksQuery = useTaskList(true)
    const { recents, record } = useOwnerRepoRecents()
    const attachmentClient = useOwnerAttachmentClient()
    const pending = usePendingAttachments(attachmentClient)
    const create = useCreateService()
    const update = useUpdateService(service?.id ?? "")

    const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data])
    const projects = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data])
    const tasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data])

    const form = useForm<ServiceFormValues>({
        resolver: zodResolver(serviceFormSchema),
        mode: "onChange",
        defaultValues: service
            ? {
                  clientId: service.clientId,
                  projectId: service.project?.id ?? "",
                  taskId: service.task?.exists ? service.task.id : "",
                  description: service.description,
                  serviceDate: service.serviceDate.slice(0, 10),
                  title: service.title ?? "",
                  summary: service.summary ?? "",
              }
            : { clientId: "", projectId: "", taskId: "", description: "", serviceDate: todayDateInput(), title: "", summary: "" },
    })
    const errors = form.formState.errors
    const selectedClientId = useWatch({ control: form.control, name: "clientId" })
    const selectedClient = clients.find((client) => client.id === selectedClientId)

    const [amounts, setAmounts] = useState<ServiceAmountValues>(() =>
        service
            ? { origin: "hours", hours: service.hours, clientHours: service.clientHours, billingBrl: service.billingBrl }
            : { origin: "hours", hours: 0, clientHours: 0, billingBrl: 0 },
    )

    const applyClient = useCallback(
        (clientId: string, base: ServiceAmountValues) => {
            const client = clients.find((item) => item.id === clientId)
            const computed = computeServiceAmounts({ ...base, factor: client?.profitFactor ?? 1, hourlyRate: client?.hourlyRate ?? 0 })
            setAmounts({ origin: base.origin, ...computed })
        },
        [clients],
    )

    const onPickTask = useCallback(
        async (taskId: string) => {
            form.setValue("taskId", taskId, { shouldValidate: true })
            try {
                const info = await fetchTaskForService(taskId)
                if (info.projectId) form.setValue("projectId", info.projectId)
                if (info.clientId && clients.some((client) => client.id === info.clientId)) {
                    form.setValue("clientId", info.clientId, { shouldValidate: true })
                    applyClient(info.clientId, amounts)
                }
            } catch {
                // Silencioso: o usuário pode escolher cliente/repositório manualmente.
            }
        },
        [applyClient, amounts, clients, form],
    )

    const orderProjects = useCallback((items: readonly ProjectRef[]) => orderByRecency(items, recents, (item) => item.id), [recents])
    const submitting = create.isPending || update.isPending
    const canSubmit = form.formState.isValid && pending.active === 0 && !submitting

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
            <header className="space-y-3">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={SERVICES_PATH}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Financeiro
                    </Link>
                </Button>
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">{service ? `Editar serviço ${service.code}` : "Novo serviço"}</h1>
                    <p className="text-sm text-muted-foreground">Lançamento manual de faturamento: escolha o cliente, descreva o serviço e informe os valores.</p>
                </div>
            </header>

            <Card>
                <CardContent className="pt-6">
                    <form
                        className="space-y-5"
                        onSubmit={form.handleSubmit(async (values) => {
                            const input: ServiceWriteInput = {
                                clientId: values.clientId,
                                projectId: values.projectId || null,
                                taskId: values.taskId || null,
                                description: values.description,
                                serviceDate: values.serviceDate,
                                origin: amounts.origin,
                                hours: amounts.hours,
                                clientHours: amounts.clientHours,
                                billingBrl: amounts.billingBrl,
                                title: values.title.trim() || null,
                                summary: values.summary.trim() || null,
                                attachmentIds: pending.ids,
                            }
                            try {
                                if (service) {
                                    await update.mutateAsync(input)
                                    router.push(serviceDetailPath(service.id))
                                } else {
                                    await create.mutateAsync(input)
                                    router.push(SERVICES_PATH)
                                }
                            } catch {
                                // Erro exibido pelo toast/estado.
                            }
                        })}
                    >
                        <Field id="service-client" label="Cliente" error={errors.clientId?.message}>
                            <Controller
                                control={form.control}
                                name="clientId"
                                render={({ field }) => (
                                    <SearchPicker
                                        trigger={<FieldTrigger id="service-client" placeholder="Escolha o cliente" invalid={Boolean(errors.clientId)} value={selectedClient ? selectedClient.name : undefined} />}
                                        items={clients}
                                        loading={clientsQuery.isLoading}
                                        getKey={(item) => item.id}
                                        searchKeys={["name"]}
                                        renderItem={(item) => (
                                            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                                                <span className="truncate text-sm">{item.name}</span>
                                                <span className="shrink-0 text-xs text-muted-foreground">
                                                    {formatFactorLabel(item.profitFactor)} · {formatBillingBrl(item.hourlyRate)}/h
                                                </span>
                                            </span>
                                        )}
                                        onPick={(item) => {
                                            field.onChange(item.id)
                                            applyClient(item.id, amounts)
                                        }}
                                        matchTriggerWidth
                                        searchLabel="Buscar cliente"
                                        listLabel="Clientes"
                                        emptyText="Nenhum cliente cadastrado"
                                        emptySearchText="Nenhum cliente encontrado"
                                    />
                                )}
                            />
                        </Field>

                        <Field id="service-repo" label="Repositório (opcional)">
                            <Controller
                                control={form.control}
                                name="projectId"
                                render={({ field }) => {
                                    const selected = projects.find((project) => project.id === field.value)
                                    return (
                                        <SearchPicker
                                            trigger={<FieldTrigger id="service-repo" placeholder="Sem repositório" value={selected ? <GithubRepoLabel repo={repoLabelOption(selected.repo, repoIndex)} /> : undefined} />}
                                            items={projects}
                                            orderItems={orderProjects}
                                            getKey={(item) => item.id}
                                            searchKeys={["repo", "name", "sigla"]}
                                            renderItem={(item) => <GithubRepoLabel repo={repoLabelOption(item.repo, repoIndex)} />}
                                            onPick={(item) => {
                                                field.onChange(item.id)
                                                record(item.id)
                                            }}
                                            footer={
                                                <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => field.onChange("")}>
                                                    Sem repositório
                                                </Button>
                                            }
                                            matchTriggerWidth
                                            searchLabel="Buscar repositório"
                                            listLabel="Repositórios vinculados"
                                            emptyText="Nenhum repositório vinculado"
                                            emptySearchText="Nenhum repositório encontrado"
                                        />
                                    )
                                }}
                            />
                        </Field>

                        <Field id="service-task" label="Tarefa (opcional)">
                            <Controller
                                control={form.control}
                                name="taskId"
                                render={({ field }) => {
                                    const selected = tasks.find((task) => task.id === field.value)
                                    return (
                                        <SearchPicker
                                            trigger={<FieldTrigger id="service-task" placeholder="Sem tarefa" value={selected ? `${selected.code} · ${selected.title}` : undefined} />}
                                            items={tasks}
                                            getKey={(item) => item.id}
                                            searchKeys={["code", "title"]}
                                            renderItem={(item) => (
                                                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                                                    <span className="shrink-0 font-mono text-xs text-primary">{item.code}</span>
                                                    <span className="truncate text-sm">{item.title}</span>
                                                </span>
                                            )}
                                            onPick={(item) => void onPickTask(item.id)}
                                            footer={
                                                <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => field.onChange("")}>
                                                    Sem tarefa
                                                </Button>
                                            }
                                            matchTriggerWidth
                                            searchLabel="Buscar tarefa"
                                            listLabel="Tarefas"
                                            emptyText="Nenhuma tarefa"
                                            emptySearchText="Nenhuma tarefa encontrada"
                                        />
                                    )
                                }}
                            />
                        </Field>

                        <Field id="service-date" label="Data do serviço">
                            <Controller control={form.control} name="serviceDate" render={({ field }) => <DatePicker id="service-date" value={field.value} onChange={field.onChange} />} />
                        </Field>

                        <Field id="service-description" label="Descrição" error={errors.description?.message}>
                            <Controller
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <MarkdownField
                                        id="service-description"
                                        value={field.value}
                                        onChange={field.onChange}
                                        rows={10}
                                        invalid={Boolean(errors.description)}
                                        placeholder="Descreva o serviço (Markdown, imagens por URL, links...)"
                                        uploads={pending.media}
                                    />
                                )}
                            />
                        </Field>

                        <Field id="service-attachments" label="Anexos">
                            <PendingAttachmentsField state={pending} />
                        </Field>

                        <ServiceAmountsFields factor={selectedClient?.profitFactor ?? 1} hourlyRate={selectedClient?.hourlyRate ?? 0} value={amounts} onChange={setAmounts} />

                        {service && (
                            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field id="service-title" label="Título (opcional)">
                                        <Controller control={form.control} name="title" render={({ field }) => <Input id="service-title" value={field.value} onChange={field.onChange} placeholder="A IA preenche automaticamente" maxLength={120} />} />
                                    </Field>
                                    <Field id="service-summary" label="Resumo (opcional)">
                                        <Controller control={form.control} name="summary" render={({ field }) => <Input id="service-summary" value={field.value} onChange={field.onChange} placeholder="A IA preenche automaticamente" maxLength={400} />} />
                                    </Field>
                                </div>
                                <ServiceAiPanel service={service} />
                            </div>
                        )}

                        <FormFooter>
                            {pending.active > 0 && (
                                <p role="status" className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Enviando anexos…
                                </p>
                            )}
                            <Button type="button" variant="ghost" asChild disabled={submitting}>
                                <Link href={service ? serviceDetailPath(service.id) : SERVICES_PATH}>Cancelar</Link>
                            </Button>
                            <Button type="submit" disabled={!canSubmit}>
                                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                                {service ? "Salvar" : "Criar serviço"}
                            </Button>
                        </FormFooter>
                    </form>
                </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground" aria-live="polite">
                {formatBillingBrl(amounts.billingBrl)} · {formatHours(amounts.clientHours)} infladas · {formatHours(amounts.hours)} reais
            </p>
        </motion.section>
    )
}
