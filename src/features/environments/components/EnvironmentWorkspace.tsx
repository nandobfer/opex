"use client"

import Link from "next/link"
import { useEffect } from "react"
import { z } from "zod"
import { usePersistentState } from "@/hooks/usePersistentState"
import { useRouter, useSearchParams } from "next/navigation"
import { Container, Plus, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState } from "@/components/feedback/ErrorState"
import {
    useEnvironmentApi,
    useEnvironmentList,
    useEnvironmentRepoConfig,
    useEnvironmentRepos,
} from "../hooks/useEnvironments"
import { EnvironmentPanel } from "./EnvironmentPanel"
import { VirtualItems } from "./VirtualItems"
const recentRepoSchema = z.string().regex(/^[a-f0-9]{24}$|^$/)

export function EnvironmentWorkspace({ repoId }: { repoId: string }) {
    const api = useEnvironmentApi()
    const repos = useEnvironmentRepos()
    const list = useEnvironmentList(repoId)
    const config = useEnvironmentRepoConfig(repoId)
    const router = useRouter()
    const params = useSearchParams()
    const selected = params.get("ambiente") || list.data?.[0]?.id || ""
    const mobileDetail = params.has("ambiente")
    const storageKey = `opex-environments-repo-v1:${api.clientId || "local"}`
    const { value: recentRepo, setValue: setRecentRepo, ready } = usePersistentState(storageKey, recentRepoSchema, "")
    useEffect(() => {
        if (!ready || !repos.data?.length) return
        if (repoId && repos.data.some((p) => p.id === repoId)) {
            if (recentRepo !== repoId) setRecentRepo(repoId)
            return
        }
        const next = repos.data.find((p) => p.id === recentRepo) ?? repos.data[0]
        router.replace(`${api.href}/${next.id}`)
    }, [repos.data, repoId, router, api.href, ready, recentRepo, setRecentRepo])
    if (repos.isLoading) return <Skeleton className="h-96 w-full" />
    if (repos.isError)
        return <ErrorState title="Não foi possível listar os repositórios" onRetry={() => void repos.refetch()} />
    if (!repos.data?.length)
        return (
            <section className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-8">
                <Container className="h-10 w-10 text-muted-foreground" />
                <h1>Ambientes</h1>
                <p className="text-sm text-muted-foreground">
                    Nenhum repositório acessível.{" "}
                    {api.portal ? "Solicite o vínculo ao dono." : "Vincule um repositório na integração GitHub."}
                </p>
                {!api.portal && (
                    <Button asChild>
                        <Link href="/integracoes/github">Configurar GitHub</Link>
                    </Button>
                )}
            </section>
        )
    return (
        <section className="flex min-w-0 flex-col gap-6">
            <h1 className="text-lg font-semibold md:text-2xl">Ambientes</h1>
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
                <aside className={`${mobileDetail ? "hidden lg:flex" : "flex"} min-w-0 flex-col gap-4`}>
                    <div className="flex items-center gap-2">
                        <Select value={repoId} onValueChange={(id) => router.push(`${api.href}/${id}`)}>
                            <SelectTrigger className="w-full" aria-label="Repositório">
                                <SelectValue placeholder="Selecione o repositório" />
                            </SelectTrigger>
                            <SelectContent>
                                {repos.data.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.repo}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {config.data?.canEdit && (
                            <Button variant="outline" size="icon" asChild>
                                <Link href={`${api.href}/${repoId}/config`} aria-label="Configurações do repositório">
                                    <Settings />
                                </Link>
                            </Button>
                        )}
                    </div>
                    {config.data?.canEdit && (
                        <Button asChild variant="outline">
                            <Link href={`${api.href}/${repoId}/ambiente/novo`}>
                                <Plus className="mr-2 h-4 w-4" />
                                Novo ambiente
                            </Link>
                        </Button>
                    )}
                    {list.isLoading ? (
                        <Skeleton className="h-48 w-full" />
                    ) : list.isError ? (
                        <ErrorState title="Falha ao listar ambientes" onRetry={() => void list.refetch()} />
                    ) : !list.data?.length ? (
                        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                            Nenhum ambiente cadastrado.
                        </p>
                    ) : (
                        <nav aria-label="Ambientes" className="flex flex-col gap-2">
                            <VirtualItems
                                items={list.data}
                                getKey={(env) => env.id}
                                render={(env) => (
                                    <Button
                                        key={env.id}
                                        variant={selected === env.id ? "secondary" : "ghost"}
                                        className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                                        asChild
                                    >
                                        <Link href={`${api.href}/${repoId}?ambiente=${env.id}`}>
                                            <Container className="mr-2 h-4 w-4 shrink-0" />
                                            <span>
                                                {env.name}
                                                <span className="block text-xs text-muted-foreground">
                                                    {env.branch}
                                                    {env.activeOperationId ? " · Em operação" : ""}
                                                </span>
                                            </span>
                                        </Link>
                                    </Button>
                                )}
                            />
                        </nav>
                    )}
                </aside>
                <main className={`${mobileDetail ? "block" : "hidden lg:block"} min-w-0`}>
                    <Button
                        variant="ghost"
                        className="mb-3 lg:hidden"
                        onClick={() => router.push(`${api.href}/${repoId}`)}
                    >
                        Voltar para ambientes
                    </Button>
                    {selected ? (
                        <EnvironmentPanel key={selected} repoId={repoId} envId={selected} />
                    ) : (
                        <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                            Selecione ou crie um ambiente para começar.
                        </div>
                    )}
                </main>
            </div>
        </section>
    )
}
