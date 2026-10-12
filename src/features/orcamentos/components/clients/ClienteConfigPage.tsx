"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowLeft, Eye, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { useGithubRepoIndex } from "@/features/github/hooks/useGithub"
import { formatNumberBR } from "@/lib/format"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ORCAMENTOS_PATH } from "../../constants"
import { formatFactorLabel } from "../../logic"
import { useCreateCliente, useOrcamentoClient, useUpdateCliente } from "../../hooks/useOrcamentos"
import { ClienteDialog } from "./ClienteDialog"
import { ClientTokenDialog } from "./ClientTokenDialog"
import { ClienteTokenTab } from "./ClienteTokenTab"
import { RemoveClienteDialog } from "./RemoveClienteDialog"
import { ClienteUsersTab } from "../users/ClienteUsersTab"

type ConfigTab = "settings" | "users" | "token"

/** Página de configuração de um cliente: dados, usuários e token do portal. */
export function ClienteConfigPage({ clientId }: { clientId: string }) {
    const query = useOrcamentoClient(clientId)
    const repoIndex = useGithubRepoIndex(true)
    const create = useCreateCliente()
    const update = useUpdateCliente()
    const [tab, setTab] = useState<ConfigTab>("settings")
    const [editing, setEditing] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [token, setToken] = useState<{ value: string; name: string } | null>(null)
    const client = query.data

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
            <header className="space-y-3">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={ORCAMENTOS_PATH}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Clientes
                    </Link>
                </Button>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">{client?.name ?? "Cliente"}</h1>
                        <p className="text-sm text-muted-foreground">Dados, usuários e token do portal deste cliente.</p>
                    </div>
                    {client && (
                        <Button asChild variant="outline" size="sm" className="gap-1.5">
                            {/* Navegação completa para o handler que grava o cookie de pré-visualização. */}
                            <a href={withBasePath(`/api/auth/preview-client?clientId=${encodeURIComponent(client.id)}`)}>
                                <Eye className="h-4 w-4" aria-hidden /> Pré-visualizar portal
                            </a>
                        </Button>
                    )}
                </div>
            </header>

            {query.isLoading ? (
                <Skeleton className="h-72 w-full" />
            ) : query.isError || !client ? (
                <ErrorState title="Não foi possível carregar o cliente" description={apiErrorMessage(query.error, "Volte e tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <Tabs value={tab} onValueChange={(value) => setTab(value as ConfigTab)}>
                    <TabsList>
                        <TabsTrigger value="settings">Configurações</TabsTrigger>
                        <TabsTrigger value="users">Usuários</TabsTrigger>
                        <TabsTrigger value="token">Token</TabsTrigger>
                    </TabsList>

                    <TabsContent value="settings" className="mt-4">
                        <div className="space-y-4">
                            <Card>
                                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                                    <div className="space-y-1.5">
                                        <CardTitle className="text-base">Dados do cliente</CardTitle>
                                        <CardDescription>Custo por hora, fator de lucro e repositórios permitidos no portal.</CardDescription>
                                    </div>
                                    <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                                        <Pencil className="h-4 w-4" aria-hidden /> Editar
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                        <Info label="Custo por hora" value={`R$ ${formatNumberBR(client.hourlyRate)}`} />
                                        <Info label="Fator de lucro" value={formatFactorLabel(client.profitFactor)} />
                                        <Info label="Situação" value={client.active ? "Ativo" : "Desativado"} />
                                        <Info label="Prefixo do token" value={`${client.tokenPrefix}…`} />
                                    </dl>
                                    <div className="space-y-1.5">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Repositórios</p>
                                        {client.projects.length === 0 ? (
                                            <p className="text-sm text-warning">Nenhum repositório válido: o portal não mostra tarefas.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {client.projects.map((project) => (
                                                    <span key={project.id} className="inline-flex max-w-[260px] items-center rounded-md border px-1.5 py-0.5 text-xs">
                                                        <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} />
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-destructive/40">
                                <CardHeader className="space-y-1.5">
                                    <CardTitle className="text-base">Excluir cliente</CardTitle>
                                    <CardDescription>Remove o cliente, seus usuários e os rascunhos do portal. As tarefas já criadas permanecem.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Button type="button" variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setRemoving(true)}>
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir cliente
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="users" className="mt-4">
                        <ClienteUsersTab clientId={clientId} />
                    </TabsContent>

                    <TabsContent value="token" className="mt-4">
                        <ClienteTokenTab client={client} onToken={(value) => setToken({ value, name: client.name })} />
                    </TabsContent>
                </Tabs>
            )}

            <ClienteDialog
                open={editing}
                client={client ?? null}
                submitting={create.isPending || update.isPending}
                repoIndex={repoIndex}
                onClose={() => setEditing(false)}
                onSubmit={async (values) => {
                    try {
                        const item = await update.mutateAsync({ id: clientId, input: values })
                        return { item }
                    } catch {
                        return null
                    }
                }}
            />

            <ClientTokenDialog token={token?.value ?? null} clientName={token?.name ?? ""} onClose={() => setToken(null)} />

            <RemoveClienteDialog client={removing ? (client ?? null) : null} onClose={() => setRemoving(false)} />
        </motion.section>
    )
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border bg-muted/30 p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono text-sm">{value}</dd>
        </div>
    )
}
