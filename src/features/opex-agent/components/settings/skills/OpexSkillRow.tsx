"use client"

import { ArrowUpCircle, Github, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ResourceRowFrame, ResourceVersionText, type ResourceRowAction } from "@/components/resources/ResourceRowFrame"
import type { OpexSkillDto } from "../../../skills"

export interface OpexSkillRowActions {
    onToggle: (skill: OpexSkillDto, enabled: boolean) => void
    onEdit: (skill: OpexSkillDto) => void
    onUpdate: (skill: OpexSkillDto) => void
    onRemove: (skill: OpexSkillDto) => void
}

/** Linha de uma skill do Opex: nome, origem, versão, situação, switch e Editar/Atualizar/Remover. */
export function OpexSkillRow({ skill, actions, busy }: { skill: OpexSkillDto; actions: OpexSkillRowActions; busy?: boolean }) {
    const installed = skill.origin.kind === "github"
    const list: ResourceRowAction[] = [{ key: "edit", label: "Editar", icon: Pencil, onSelect: () => actions.onEdit(skill) }]
    if (skill.version?.outdated) list.push({ key: "update", label: "Atualizar", icon: ArrowUpCircle, onSelect: () => actions.onUpdate(skill) })
    list.push({ key: "remove", label: installed ? "Desinstalar" : "Remover", icon: Trash2, onSelect: () => actions.onRemove(skill), destructive: true })
    return (
        <ResourceRowFrame
            name={skill.name}
            enabled={skill.enabled}
            description={skill.description}
            badges={
                <>
                    <Badge variant="outline" className="max-w-[16rem] gap-1 truncate text-[11px]" title={skill.sourceLabel}>
                        {installed ? <Github className="h-3 w-3 shrink-0" aria-hidden /> : null}
                        <span className="truncate">{skill.sourceLabel}</span>
                    </Badge>
                    {skill.version ? <ResourceVersionText installed={skill.version.installed} available={skill.version.available} outdated={skill.version.outdated} /> : null}
                    {skill.version?.outdated ? (
                        <Badge variant="warning" className="text-[11px]">
                            Com atualização
                        </Badge>
                    ) : null}
                    {skill.fileCount ? (
                        <Badge variant="secondary" className="text-[11px] font-normal">
                            {skill.fileCount} arquivo(s)
                        </Badge>
                    ) : null}
                </>
            }
            switchDisabled={busy}
            onToggle={(checked) => actions.onToggle(skill, checked)}
            actions={list}
        />
    )
}
