"use client"

import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Lock, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ChipList } from "@/components/ui/removable-chip"
import { SearchPicker } from "@/components/ui/search-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ColumnIconView } from "@/features/tasks/components/column-icons"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPES } from "@/features/tasks/constants"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"
import { repoLinkInputSchema, type RepoLinkInput, type RepoLinkValues } from "../../schemas"
import type { GithubRepoLinkDto, GithubUserOption } from "../../types"
import { useGithubProducts, useGithubRepos, useGithubUsers, type ProductLinkOption } from "../../hooks/useGithub"
import { FieldTrigger, GithubAvatar, GithubUserLabel } from "../shared"

interface GithubLinkDialogProps {
    open: boolean
    /** Vínculo em edição; `null` = novo. */
    link: GithubRepoLinkDto | null
    links: readonly GithubRepoLinkDto[]
    submitting: boolean
    onSubmit: (values: RepoLinkInput) => Promise<boolean>
    onClose: () => void
}

const EMPTY: RepoLinkInput = { repo: "", productId: "", productName: "", authors: [], entryColumnKey: "", defaultType: "feature", defaultPriority: "medium", enabled: true }
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({ value, label: TASK_PRIORITY_LABELS[value] }))

function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value)
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), ms)
        return () => clearTimeout(timer)
    }, [value, ms])
    return debounced
}

/**
 * Vínculo repositório ↔ produto: repositório (lista do token), produto do Go! Sipal (sugerido pelo
 * `repositoryUrl`; um para um), autores observados, coluna pessoal de entrada e padrões de tipo e
 * prioridade.
 */
export function GithubLinkDialog({ open, link, links, submitting, onSubmit, onClose }: GithubLinkDialogProps) {
    const form = useForm<RepoLinkInput, unknown, RepoLinkValues>({ resolver: zodResolver(repoLinkInputSchema), mode: "onChange", defaultValues: EMPTY })
    const repos = useGithubRepos(open)
    const products = useGithubProducts(open)
    const board = useTaskBoard(open)
    const [userTerm, setUserTerm] = useState("")
    const users = useGithubUsers(useDebounced(userTerm, 300), open)
    const columns = board.columns.filter((column) => column.custom)

    useEffect(() => {
        if (!open) return
        form.reset(
            link
                ? { repo: link.repo, productId: link.productId, productName: link.productName, authors: link.authors, entryColumnKey: link.entryColumnKey, defaultType: link.defaultType, defaultPriority: link.defaultPriority, enabled: link.enabled }
                : EMPTY,
        )
    }, [open, link, form])

    const [repo, productId, productName, authors, columnKey] = useWatch({ control: form.control, name: ["repo", "productId", "productName", "authors", "entryColumnKey"] })
    const takenRepos = useMemo(() => new Map(links.filter((item) => item.id !== link?.id).map((item) => [item.repo, item.productName])), [links, link])
    const productList = useMemo(() => {
        const list = products.data ?? []
        // Produto sugerido pelo repositório escolhido no topo.
        return [...list].sort((a, b) => Number(b.repo === repo) - Number(a.repo === repo))
    }, [products.data, repo])
    const productReason = (product: ProductLinkOption) => (product.linkedRepo && product.linkedRepo !== link?.repo ? `Já vinculado a ${product.linkedRepo}` : false)
    const knownUsers = useMemo(() => new Map((users.data ?? []).map((user) => [user.login, user])), [users.data])
    const errors = form.formState.errors
    const selectedColumn = columns.find((column) => column.key === columnKey)

    const close = () => {
        setUserTerm("")
        onClose()
    }

    const pickRepo = (fullName: string) => {
        form.setValue("repo", fullName, { shouldValidate: true, shouldDirty: true })
        if (!form.getValues("productId")) {
            const suggested = products.data?.find((product) => product.repo === fullName && !productReason(product))
            if (suggested) {
                form.setValue("productId", suggested.id, { shouldValidate: true })
                form.setValue("productName", suggested.name, { shouldValidate: true })
            }
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !submitting && close()}>
            <DialogContent className="sm:max-w-2xl">
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.stopPropagation()
                        void form.handleSubmit(async (values) => {
                            if (await onSubmit(values)) close()
                        })(event)
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{link ? `Editar vínculo de ${link.repo}` : "Novo vínculo"}</DialogTitle>
                        <DialogDescription>Issues novas dos autores escolhidos viram rascunhos na coluna de entrada, já com o produto do Go! Sipal.</DialogDescription>
                    </DialogHeader>

                    <div className={FORM_GRID}>
                        <Field id="link-repo" label="Repositório" error={errors.repo?.message}>
                            <SearchPicker
                                trigger={<FieldTrigger id="link-repo" placeholder="Escolha o repositório" invalid={Boolean(errors.repo)} value={repo || undefined} />}
                                items={repos.data ?? []}
                                getKey={(item) => item.fullName}
                                searchKeys={["fullName", "description"]}
                                renderItem={(item) => (
                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                        <GithubAvatar login={item.fullName} avatarUrl={item.ownerAvatarUrl} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{item.fullName}</span>
                                            {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
                                        </span>
                                        {item.private && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Privado" />}
                                    </span>
                                )}
                                onPick={(item) => pickRepo(item.fullName)}
                                disabledReason={(item) => (takenRepos.has(item.fullName) ? `Já vinculado a ${takenRepos.get(item.fullName)}` : false)}
                                loading={repos.isLoading}
                                matchTriggerWidth
                                searchLabel="Buscar repositório"
                                listLabel="Repositórios"
                                emptyText={repos.isError ? "Não foi possível listar os repositórios (confira o token)" : "Nenhum repositório acessível pelo token"}
                                emptySearchText="Nenhum repositório encontrado"
                            />
                        </Field>

                        <Field id="link-product" label="Produto do Go! Sipal" error={errors.productId?.message}>
                            <SearchPicker
                                trigger={<FieldTrigger id="link-product" placeholder="Escolha o produto" invalid={Boolean(errors.productId)} value={productName || undefined} />}
                                items={productList}
                                getKey={(item) => item.id}
                                searchKeys={["name"]}
                                renderItem={(item) => (
                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                        {repo && item.repo === repo && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                                                <Sparkles className="h-3 w-3" aria-hidden /> sugerido
                                            </span>
                                        )}
                                        {productId === item.id && <span className="text-[10px] text-muted-foreground">atual</span>}
                                    </span>
                                )}
                                onPick={(item) => {
                                    form.setValue("productId", item.id, { shouldValidate: true, shouldDirty: true })
                                    form.setValue("productName", item.name, { shouldValidate: true })
                                }}
                                disabledReason={productReason}
                                loading={products.isLoading}
                                matchTriggerWidth
                                searchLabel="Buscar produto"
                                listLabel="Produtos"
                                emptyText={products.isError ? "Não foi possível listar os produtos (sessão do Go! Sipal?)" : "Nenhum produto"}
                                emptySearchText="Nenhum produto encontrado"
                            />
                        </Field>

                        <Field id="link-authors" label="Autores observados" error={errors.authors?.message} className="sm:col-span-2">
                            <div className="space-y-2">
                                <Controller
                                    control={form.control}
                                    name="authors"
                                    render={({ field }) => (
                                        <ChipList
                                            aria-label="Autores escolhidos"
                                            items={field.value.map((login) => ({ value: login, text: login, label: <GithubUserLabel login={login} avatarUrl={knownUsers.get(login)?.avatarUrl} /> }))}
                                            onRemove={(login) => field.onChange(field.value.filter((item) => item !== login))}
                                        />
                                    )}
                                />
                                <SearchPicker<GithubUserOption>
                                    trigger={
                                        <Button id="link-authors" type="button" variant="outline" size="sm" className="gap-1.5">
                                            <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar autor
                                        </Button>
                                    }
                                    items={(users.data ?? []).filter((user) => !authors.includes(user.login))}
                                    getKey={(item) => item.login}
                                    filterItems={(items, term) => {
                                        const query = term.toLowerCase()
                                        return query ? items.filter((item) => item.login.includes(query) || (item.name ?? "").toLowerCase().includes(query)) : [...items]
                                    }}
                                    onSearchChange={setUserTerm}
                                    renderItem={(item) => <GithubUserLabel login={item.login} name={item.name} avatarUrl={item.avatarUrl} />}
                                    onPick={(item) => form.setValue("authors", [...form.getValues("authors"), item.login], { shouldValidate: true, shouldDirty: true })}
                                    fetching={users.isFetching}
                                    searchLabel="Buscar pessoa no GitHub"
                                    listLabel="Pessoas do GitHub"
                                    placeholder="Login ou nome (2+ letras busca no GitHub)"
                                    emptyText="Digite para buscar no GitHub"
                                    emptySearchText="Ninguém encontrado"
                                />
                            </div>
                        </Field>

                        <Field id="link-column" label="Coluna de entrada (pessoal)" error={errors.entryColumnKey?.message}>
                            <SearchPicker
                                trigger={
                                    <FieldTrigger
                                        id="link-column"
                                        placeholder={columns.length ? "Escolha a coluna" : "Crie uma coluna pessoal no quadro"}
                                        invalid={Boolean(errors.entryColumnKey)}
                                        value={
                                            selectedColumn?.custom ? (
                                                <span className="flex items-center gap-2">
                                                    <ColumnIconView icon={selectedColumn.custom.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {selectedColumn.label}
                                                </span>
                                            ) : undefined
                                        }
                                    />
                                }
                                items={columns}
                                getKey={(item) => item.key}
                                searchKeys={["label"]}
                                renderItem={(item) => (
                                    <span className="flex items-center gap-2">
                                        <span className={`h-2 w-2 rounded-full ${item.dot}`} aria-hidden />
                                        {item.custom && <ColumnIconView icon={item.custom.icon} className="h-3.5 w-3.5 text-muted-foreground" />}
                                        {item.label}
                                    </span>
                                )}
                                onPick={(item) => form.setValue("entryColumnKey", item.key, { shouldValidate: true, shouldDirty: true })}
                                loading={board.isLoading}
                                matchTriggerWidth
                                searchLabel="Buscar coluna"
                                listLabel="Colunas pessoais"
                                emptyText="Nenhuma coluna pessoal: crie uma no quadro de Tarefas"
                                emptySearchText="Nenhuma coluna encontrada"
                            />
                        </Field>

                        <Field id="link-type" label="Tipo padrão (sem regra que case)" error={errors.defaultType?.message}>
                            <Controller
                                control={form.control}
                                name="defaultType"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger id="link-type" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TASK_TYPES.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {TASK_TYPE_LABELS[type]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </Field>

                        <Field id="link-priority" label="Prioridade padrão" className="sm:col-span-2">
                            <Controller
                                control={form.control}
                                name="defaultPriority"
                                render={({ field }) => <OptionTabs id="link-priority" options={PRIORITY_OPTIONS} value={field.value} onChange={field.onChange} size="md" className="w-full" />}
                            />
                        </Field>

                        <label htmlFor="link-enabled" className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2">
                            <span>
                                <span className="block text-sm font-medium">Sincronização ativa</span>
                                <span className="block text-xs text-muted-foreground">Desligado, a rotina ignora este repositório (rascunhos existentes continuam no quadro).</span>
                            </span>
                            <Controller control={form.control} name="enabled" render={({ field }) => <Switch id="link-enabled" checked={field.value} onCheckedChange={field.onChange} />} />
                        </label>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting || !form.formState.isValid}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            {link ? "Salvar" : "Vincular"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
