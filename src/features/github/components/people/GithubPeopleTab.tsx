"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Check, Loader2, RefreshCw, Search, Sparkles, UserMinus, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { AssigneeAvatar } from "@/features/tasks/components/TaskBadges"
import { useTaskOptions } from "@/features/tasks/hooks/useTasks"
import type { PersonRef } from "@/features/tasks/types"
import { normalizeText } from "../../logic"
import { useAcceptSuggestions, useGithubPeople, useRefreshPeople, useSetPerson, useSuggestPeople } from "../../hooks/useGithub"
import type { GithubPersonDto } from "../../types"
import { GithubUserLabel, NotConfiguredHint } from "../shared"

type Filter = "all" | "unmapped" | "suggested"

/**
 * Aba Pessoas: assignees dos repositórios vinculados (e autores) ↔ desenvolvedores do Go! Sipal.
 * Usado para o responsável do rascunho e o nome de quem abriu a issue.
 */
export function GithubPeopleTab({ configured }: { configured: boolean }) {
    const people = useGithubPeople()
    const options = useTaskOptions(configured)
    const refresh = useRefreshPeople()
    const suggest = useSuggestPeople()
    const accept = useAcceptSuggestions()
    const setPerson = useSetPerson()
    const [filter, setFilter] = useState<Filter>("all")
    const [term, setTerm] = useState("")

    const list = useMemo(() => people.data ?? [], [people.data])
    const counts = { unmapped: list.filter((person) => !person.developerId).length, suggested: list.filter((person) => person.suggestion).length }
    const visible = useMemo(() => {
        const query = normalizeText(term)
        return list.filter((person) => {
            if (filter === "unmapped" && person.developerId) return false
            if (filter === "suggested" && !person.suggestion) return false
            return !query || normalizeText(`${person.login} ${person.name ?? ""} ${person.developerName ?? ""}`).includes(query)
        })
    }, [list, filter, term])

    if (!configured) return <NotConfiguredHint />

    return (
        <Card>
            <CardHeader className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base">Pessoas</CardTitle>
                        <CardDescription>Login do GitHub → desenvolvedor do Go! Sipal. O primeiro assignee com correspondência vira o responsável do rascunho.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
                            {refresh.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                            Buscar no GitHub
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={suggest.isPending || counts.unmapped === 0} onClick={() => suggest.mutate()}>
                            {suggest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                            Sugerir correspondências
                        </Button>
                        <AnimatePresence initial={false}>
                            {counts.suggested > 0 && (
                                <motion.span key="accept-all" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                                    <Button type="button" size="sm" className="gap-1.5" disabled={accept.isPending} onClick={() => accept.mutate(list.filter((person) => person.suggestion).map((person) => person.login))}>
                                        <Check className="h-3.5 w-3.5" aria-hidden /> Aceitar todas ({counts.suggested})
                                    </Button>
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa" className="pl-8" />
                    </div>
                    <OptionTabs
                        options={[
                            { value: "all", label: `Todas (${list.length})` },
                            { value: "unmapped", label: `Sem correspondência (${counts.unmapped})` },
                            { value: "suggested", label: `Com sugestão (${counts.suggested})` },
                        ]}
                        value={filter}
                        onChange={setFilter}
                        size="sm"
                        className="w-full"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {people.isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }, (_, index) => (
                            <Skeleton key={index} className="h-12 w-full" />
                        ))}
                    </div>
                ) : people.isError ? (
                    <ErrorState title="Não foi possível carregar as pessoas" description={apiErrorMessage(people.error, "Tente novamente.")} onRetry={() => void people.refetch()} />
                ) : list.length === 0 ? (
                    <EmptyState icon={Users} title="Nenhuma pessoa ainda" description="Busque os assignees dos repositórios vinculados no GitHub." actionLabel="Buscar no GitHub" onAction={() => refresh.mutate()} />
                ) : visible.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Ninguém com estes filtros.</p>
                ) : (
                    <ul className="divide-y">
                        <AnimatePresence initial={false}>
                            {visible.map((person) => (
                                <motion.li key={person.login} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                    <PersonRow
                                        person={person}
                                        developers={options.data?.developers ?? []}
                                        loadingDevelopers={options.isLoading}
                                        pending={setPerson.isPending && setPerson.variables?.login === person.login}
                                        onChange={(developer) => setPerson.mutate({ login: person.login, developer })}
                                        onAccept={() => accept.mutate([person.login])}
                                    />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

interface PersonRowProps {
    person: GithubPersonDto
    developers: readonly PersonRef[]
    loadingDevelopers: boolean
    pending: boolean
    onChange: (developer: { id: string; name: string } | null) => void
    onAccept: () => void
}

function PersonRow({ person, developers, loadingDevelopers, pending, onChange, onAccept }: PersonRowProps) {
    const current = person.developerId ? { id: person.developerId, name: person.developerName ?? "—", email: null } : null
    return (
        <div className="grid gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className="min-w-0">
                <GithubUserLabel login={person.login} name={person.name} avatarUrl={person.avatarUrl} />
                {person.repos.length > 0 && <p className="mt-0.5 truncate pl-7 text-[11px] text-muted-foreground">{person.repos.join(", ")}</p>}
            </div>
            <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SearchPicker<PersonRef>
                    trigger={
                        <button
                            type="button"
                            aria-label={`Desenvolvedor de @${person.login}`}
                            className={cn(
                                "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-sm transition-colors hover:border-primary/60",
                                !current && "border-dashed text-muted-foreground",
                            )}
                        >
                            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : current ? <AssigneeAvatar person={current} showName /> : "Sem correspondência"}
                        </button>
                    }
                    items={developers}
                    getKey={(item) => item.id}
                    searchKeys={["name", "email"]}
                    renderItem={(item) => (
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                            <AssigneeAvatar person={item} showName />
                            {item.id === person.developerId && <Check className="ml-auto h-3.5 w-3.5 text-primary" aria-hidden />}
                        </span>
                    )}
                    onPick={(item) => onChange({ id: item.id, name: item.name })}
                    loading={loadingDevelopers}
                    searchLabel="Buscar desenvolvedor"
                    listLabel="Desenvolvedores do Go! Sipal"
                    emptyText="Nenhum desenvolvedor (sessão do Go! Sipal?)"
                    emptySearchText="Ninguém encontrado"
                    footer={
                        current ? (
                            <button type="button" onClick={() => onChange(null)} className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-destructive">
                                <UserMinus className="h-3.5 w-3.5" aria-hidden /> Remover correspondência
                            </button>
                        ) : undefined
                    }
                />
                <AnimatePresence initial={false}>
                    {person.suggestion && (
                        <motion.span key="suggestion" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2 pr-0.5 text-xs text-primary">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            {person.suggestion.developerName} <span className="text-[10px] opacity-75">({person.suggestion.reason})</span>
                            <button type="button" aria-label={`Aceitar ${person.suggestion.developerName}`} onClick={onAccept} className="rounded-full p-0.5 hover:bg-primary/20">
                                <Check className="h-3 w-3" aria-hidden />
                            </button>
                            <button type="button" aria-label="Ignorar sugestão" onClick={() => onChange(current)} className="rounded-full p-0.5 hover:bg-primary/20">
                                <X className="h-3 w-3" aria-hidden />
                            </button>
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
