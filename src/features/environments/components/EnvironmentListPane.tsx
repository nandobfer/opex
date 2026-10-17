"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Fuse from "fuse.js"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Container, Plus, Search, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { WorkspacePane } from "@/components/workspace/WorkspacePane"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { RepoPicker } from "@/features/github/components/RepoPicker"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { cn } from "@/lib/utils"
import { useEnvironmentApi } from "../hooks/useEnvironments"
import type { EnvironmentDto, RepoOption } from "../types"
import { EnvironmentRow } from "./EnvironmentRow"

/** Estimativa inicial da altura das linhas; cada linha é medida de verdade. */
const ROW_HEIGHT = 56
const VIRTUALIZE_ABOVE = 50

interface EnvironmentListPaneProps {
    repoId: string
    repos: readonly RepoOption[]
    environments: readonly EnvironmentDto[]
    isLoading: boolean
    isError: boolean
    onRetry: () => void
    canEdit: boolean
    selected: string
    detailOpen: boolean
}

/**
 * Painel lateral do workspace de Ambientes: seletor do repositório (com avatar do GitHub), busca por
 * nome/branch e a lista de ambientes. Mesmo padrão da lista de tarefas da Central de desenvolvimento.
 */
export function EnvironmentListPane({ repoId, repos, environments, isLoading, isError, onRetry, canEdit, selected, detailOpen }: EnvironmentListPaneProps) {
    const api = useEnvironmentApi()
    const router = useRouter()
    const repoIndex = useRepoIndex()
    const [term, setTerm] = useState("")
    const fuse = useMemo(() => new Fuse([...environments], { keys: ["name", "branch"], threshold: 0.35, ignoreLocation: true }), [environments])
    const query = term.trim()
    const rows = useMemo(() => (query ? fuse.search(query).map((result) => result.item) : [...environments]), [fuse, query, environments])
    const scrollRef = useRef<HTMLDivElement>(null)
    // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual devolve funções não memorizáveis (padrão do projeto)
    const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 8, enabled: rows.length > VIRTUALIZE_ABOVE })
    const reduceMotion = useReducedMotion()
    const activeRepo = repos.find((repo) => repo.id === repoId) ?? null

    const actions = canEdit ? (
        <TooltipProvider>
            <div className="flex shrink-0 items-center gap-1">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                            <Link href={`${api.href}/${repoId}/ambiente/novo`} aria-label="Novo ambiente">
                                <Plus className="h-4 w-4" aria-hidden />
                            </Link>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Novo ambiente</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                            <Link href={`${api.href}/${repoId}/config`} aria-label="Configurações do repositório">
                                <Settings className="h-4 w-4" aria-hidden />
                            </Link>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Configurações do repositório</TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    ) : undefined

    return (
        <WorkspacePane
            title="Ambientes"
            count={environments.length}
            ariaLabel="Ambientes do repositório"
            testId="environments-pane"
            className={cn(detailOpen ? "max-lg:hidden" : "max-lg:flex-1 max-lg:min-h-0")}
            actions={actions}
            header={
                <>
                    <RepoPicker<RepoOption>
                        id="environment-repo"
                        items={repos}
                        active={activeRepo}
                        getKey={(repo) => repo.id}
                        renderItem={(repo) => <GithubRepoLabel repo={repoLabelOption(repo.repo, repoIndex)} />}
                        searchKeys={["name", "repo"]}
                        onPick={(repo) => router.push(`${api.href}/${repo.id}`)}
                        placeholder="Escolha o repositório"
                        searchLabel="Buscar repositório"
                        listLabel="Repositórios"
                        emptyText="Nenhum repositório"
                        emptySearchText="Nenhum repositório encontrado"
                    />
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                        <Input
                            value={term}
                            onChange={(event) => setTerm(event.target.value)}
                            placeholder="Buscar por nome ou branch"
                            className="pl-8"
                            aria-label="Buscar ambientes"
                        />
                    </div>
                </>
            }
        >
            {/* Trocar de repositório anima só a lista. */}
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={repoId}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    {isLoading ? (
                        <div className="space-y-2 p-3" aria-label="Carregando ambientes">
                            {Array.from({ length: 6 }, (_, index) => (
                                <Skeleton key={index} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : isError ? (
                        <ErrorState title="Não foi possível carregar os ambientes" onRetry={onRetry} />
                    ) : !rows.length ? (
                        environments.length ? (
                            <EmptyState icon={Search} title="Nenhum ambiente encontrado" description="Nenhum ambiente deste repositório casa com a busca." actionLabel="Limpar busca" onAction={() => setTerm("")} />
                        ) : (
                            <EmptyState
                                icon={Container}
                                title="Nenhum ambiente"
                                description={canEdit ? "Crie um ambiente para publicar e acompanhar este repositório." : "Peça ao dono para criar um ambiente deste repositório."}
                                actionLabel={canEdit ? "Novo ambiente" : undefined}
                                onAction={canEdit ? () => router.push(`${api.href}/${repoId}/ambiente/novo`) : undefined}
                            />
                        )
                    ) : (
                        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Ambientes do repositório">
                            {rows.length <= VIRTUALIZE_ABOVE ? (
                                <div className="p-1.5">
                                    {rows.map((environment) => (
                                        <EnvironmentRow key={environment.id} environment={environment} active={environment.id === selected} href={`${api.href}/${repoId}?ambiente=${environment.id}`} />
                                    ))}
                                </div>
                            ) : (
                                <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>
                                    {virtual.getVirtualItems().map((row) => {
                                        const environment = rows[row.index]!
                                        return (
                                            <div
                                                key={environment.id}
                                                ref={virtual.measureElement}
                                                data-index={row.index}
                                                className="absolute inset-x-0 px-1.5"
                                                style={{ transform: `translateY(${row.start}px)` }}
                                            >
                                                <EnvironmentRow environment={environment} active={environment.id === selected} href={`${api.href}/${repoId}?ambiente=${environment.id}`} />
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </WorkspacePane>
    )
}
