"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Cpu, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { SearchInput } from "@/components/list/SearchInput"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useDeleteTechGroup, useDeleteTechnology, useTechCatalog } from "../../hooks/useProjectBootstrap"
import { normalizeTechText } from "../../tech-detect"
import { techChipProps, techDividerStyle, techDotStyle } from "../../tech-colors"
import type { TechGroupDto, TechnologyDto } from "../../types"
import { TechGroupDialog } from "./TechGroupDialog"
import { TechnologyDialog } from "./TechnologyDialog"

type Editing = { kind: "group"; group: TechGroupDto | null } | { kind: "technology"; technology: TechnologyDto | null; groupId: string | null } | null
type Removing = { kind: "group"; group: TechGroupDto } | { kind: "technology"; technology: TechnologyDto } | null

/** Catálogo de tecnologias do Agente de Bootstrap: grupos (com cor) e tecnologias com as variantes reconhecidas. */
export function TechCatalogSection() {
    const catalog = useTechCatalog()
    const removeGroup = useDeleteTechGroup()
    const removeTechnology = useDeleteTechnology()
    const [editing, setEditing] = useState<Editing>(null)
    const [removing, setRemoving] = useState<Removing>(null)
    const [search, setSearch] = useState("")
    const groups = useMemo(() => catalog.data?.groups ?? [], [catalog.data])
    const term = normalizeTechText(search.trim())
    const technologies = useMemo(() => (catalog.data?.technologies ?? []).filter((tech) => !term || [tech.name, ...tech.aliases].some((value) => normalizeTechText(value).includes(term))), [catalog.data, term])

    if (catalog.isLoading) return <Skeleton className="h-96 w-full" />
    if (catalog.isError) return <ErrorState title="Não foi possível carregar o catálogo" description={apiErrorMessage(catalog.error, "Tente novamente.")} onRetry={() => void catalog.refetch()} />

    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Catálogo de tecnologias</CardTitle>
                    <CardDescription>Destacadas ao vivo no contexto do projeto (etapa 1) e enviadas ao agente. Um grupo com tecnologias não pode ser removido.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="gap-1.5" onClick={() => setEditing({ kind: "group", group: null })}>
                        <Plus className="h-4 w-4" aria-hidden /> Novo grupo
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={!groups.length} onClick={() => setEditing({ kind: "technology", technology: null, groupId: null })}>
                        <Plus className="h-4 w-4" aria-hidden /> Nova tecnologia
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar tecnologia ou variante" label="Buscar tecnologia" className="bg-transparent" />
                {groups.length === 0 ? (
                    <EmptyState icon={Cpu} title="Nenhum grupo ainda" description="Crie um grupo (ex.: Linguagem) e cadastre as tecnologias dele." actionLabel="Novo grupo" onAction={() => setEditing({ kind: "group", group: null })} />
                ) : (
                    groups.map((group) => {
                        const items = technologies.filter((tech) => tech.groupId === group.id)
                        if (term && !items.length) return null
                        const chip = techChipProps(group.color)
                        return (
                            <section key={group.id} className="space-y-2" data-tech-group={group.name}>
                                <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground" style={techDotStyle(group.color)} aria-hidden />
                                    <h4 className="shrink-0 text-sm font-semibold">{group.name}</h4>
                                    <span className="shrink-0 text-xs text-muted-foreground">{group.count}</span>
                                    <span className="h-px flex-1 bg-border" style={techDividerStyle(group.color)} aria-hidden />
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Nova tecnologia em ${group.name}`} onClick={() => setEditing({ kind: "technology", technology: null, groupId: group.id })}>
                                        <Plus className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Editar o grupo ${group.name}`} onClick={() => setEditing({ kind: "group", group })}>
                                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remover o grupo ${group.name}`} disabled={group.count > 0} title={group.count > 0 ? "O grupo ainda tem tecnologias" : undefined} onClick={() => setRemoving({ kind: "group", group })}>
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                </div>
                                <ul className="flex flex-wrap gap-2">
                                    <AnimatePresence initial={false}>
                                        {items.map((tech) => (
                                            <motion.li key={tech.id} layout="position" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }} className={cn("group flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs", chip.className)} style={chip.style}>
                                                <button type="button" className="font-medium hover:underline" title={tech.aliases.length ? `Variantes: ${tech.aliases.join(", ")}` : "Sem variantes"} onClick={() => setEditing({ kind: "technology", technology: tech, groupId: tech.groupId })}>
                                                    {tech.name}
                                                </button>
                                                {tech.aliases.length > 0 && <span className="opacity-70">+{tech.aliases.length}</span>}
                                                <button type="button" className="rounded-full p-0.5 opacity-60 hover:opacity-100" aria-label={`Remover ${tech.name}`} onClick={() => setRemoving({ kind: "technology", technology: tech })}>
                                                    <Trash2 className="h-3 w-3" aria-hidden />
                                                </button>
                                            </motion.li>
                                        ))}
                                    </AnimatePresence>
                                    {!items.length && <li className="text-xs text-muted-foreground">Nenhuma tecnologia neste grupo.</li>}
                                </ul>
                            </section>
                        )
                    })
                )}
            </CardContent>
            <TechGroupDialog open={editing?.kind === "group"} group={editing?.kind === "group" ? editing.group : null} onClose={() => setEditing(null)} />
            <TechnologyDialog open={editing?.kind === "technology"} technology={editing?.kind === "technology" ? editing.technology : null} defaultGroupId={editing?.kind === "technology" ? editing.groupId : null} groups={groups} onClose={() => setEditing(null)} />
            <ConfirmDialog
                open={Boolean(removing)}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={removing?.kind === "group" ? `Remover o grupo ${removing.group.name}?` : removing ? `Remover ${removing.technology.name}?` : ""}
                description="Bootstraps já enviados mantêm a lista que receberam."
                confirmLabel="Remover"
                variant="destructive"
                pending={removeGroup.isPending || removeTechnology.isPending}
                onConfirm={() => {
                    if (!removing) return
                    const done = { onSuccess: () => setRemoving(null) }
                    if (removing.kind === "group") removeGroup.mutate(removing.group.id, done)
                    else removeTechnology.mutate(removing.technology.id, done)
                }}
            />
        </Card>
    )
}
