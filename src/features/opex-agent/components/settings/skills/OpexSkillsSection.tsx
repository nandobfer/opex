"use client"

import { useMemo, useState } from "react"
import { ArrowUpCircle, Github, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ResourceListCard } from "@/components/resources/ResourceListCard"
import { matchesSkillFilter, outdatedSkills, type OpexSkillDto, type OpexSkillFilter } from "../../../skills"
import { useDeleteOpexSkill, useOpexSkills, useOpexSkillsRealtime, useRefreshOpexSkills, useToggleOpexSkill, useUpdateOpexSkills } from "../../../hooks/useOpexSkills"
import { OpexSkillRemoveDialog, OpexSkillUpdateDialog } from "./OpexSkillConfirmDialogs"
import { OpexSkillEditorDialog } from "./OpexSkillEditorDialog"
import { OpexSkillInstallDialog } from "./OpexSkillInstallDialog"
import { OpexSkillRow } from "./OpexSkillRow"

const FILTERS: { value: OpexSkillFilter; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "enabled", label: "Ligadas" },
    { value: "disabled", label: "Desligadas" },
    { value: "outdated", label: "Com atualização" },
]
const SEARCH_KEYS = ["name", "description", "sourceLabel"]

/**
 * Seção "Skills" do Agente Opex (OPE-153): lista, cria com texto, edita, instala/atualiza do GitHub,
 * remove e liga/desliga as skills que o agente usa nas conversas do dono. Cada ação grava na hora, com
 * tempo real. A mesma UX da aba Skills do OpenCode (`ResourceListCard`/`ResourceRowFrame` compartilhados).
 */
export function OpexSkillsSection() {
    const list = useOpexSkills()
    const refresh = useRefreshOpexSkills()
    const toggle = useToggleOpexSkill()
    const remove = useDeleteOpexSkill()
    const update = useUpdateOpexSkills()
    const [editor, setEditor] = useState<OpexSkillDto | "new" | null>(null)
    const [installing, setInstalling] = useState(false)
    const [removing, setRemoving] = useState<OpexSkillDto | null>(null)
    const [updating, setUpdating] = useState<OpexSkillDto[] | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    useOpexSkillsRealtime()
    const pendingUpdates = useMemo(() => outdatedSkills(list.data), [list.data])
    const names = useMemo(() => (list.data ?? []).map((skill) => skill.name), [list.data])
    const busyId = toggle.isPending ? toggle.variables?.id : undefined

    const onRefresh = async () => {
        setRefreshing(true)
        await refresh()
        setRefreshing(false)
    }
    const createButtons = (
        <>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setInstalling(true)}>
                <Github className="h-3.5 w-3.5" aria-hidden /> Instalar do GitHub
            </Button>
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditor("new")}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Nova skill
            </Button>
        </>
    )

    return (
        <>
            <ResourceListCard
                title="Skills"
                description="Instruções reutilizáveis que o Agente Opex carrega quando o pedido combina com a descrição. O switch vale só para as conversas do dono; os agentes rotineiros do motor Opex escolhem as suas no editor."
                icon={Sparkles}
                items={list.data}
                loading={list.isLoading}
                error={list.isError ? list.error : null}
                errorHint="Tente de novo."
                fetching={list.isFetching || refreshing}
                onRefresh={() => void onRefresh()}
                rowKey={(skill) => skill.id}
                renderRow={(skill) => (
                    <OpexSkillRow
                        skill={skill}
                        busy={busyId === skill.id}
                        actions={{ onToggle: (item, enabled) => toggle.mutate({ id: item.id, enabled }), onEdit: setEditor, onUpdate: (item) => setUpdating([item]), onRemove: setRemoving }}
                    />
                )}
                searchKeys={SEARCH_KEYS}
                filters={FILTERS}
                matches={matchesSkillFilter}
                emptyTitle="Nenhuma skill no Agente Opex"
                emptyDescription="Crie uma skill com texto ou instale de um repositório do GitHub."
                emptyActions={createButtons}
                headerActions={
                    <>
                        {pendingUpdates.length > 0 ? (
                            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setUpdating(pendingUpdates)}>
                                <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden /> Atualizar todos ({pendingUpdates.length})
                            </Button>
                        ) : null}
                        {createButtons}
                    </>
                }
            />
            <OpexSkillEditorDialog target={editor} takenNames={names} onClose={() => setEditor(null)} />
            <OpexSkillInstallDialog open={installing} onClose={() => setInstalling(false)} />
            <OpexSkillRemoveDialog skill={removing} pending={remove.isPending} onClose={() => setRemoving(null)} onConfirm={(skill) => remove.mutate(skill.id, { onSettled: () => setRemoving(null) })} />
            <OpexSkillUpdateDialog
                skills={updating}
                pending={update.isPending}
                onClose={() => setUpdating(null)}
                onConfirm={(skills) => update.mutate(skills.length === pendingUpdates.length && skills.length > 1 ? { all: true } : { ids: skills.map((skill) => skill.id) }, { onSettled: () => setUpdating(null) })}
            />
        </>
    )
}
