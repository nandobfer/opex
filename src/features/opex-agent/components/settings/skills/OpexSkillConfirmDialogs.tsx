"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import type { OpexSkillDto } from "../../../skills"
import { useOpexSkillUsage } from "../../../hooks/useOpexSkills"

/** Remover/desinstalar (D6): avisa quantos agentes rotineiros usam a skill — ela sai da seleção deles. */
export function OpexSkillRemoveDialog({ skill, pending, onConfirm, onClose }: { skill: OpexSkillDto | null; pending: boolean; onConfirm: (skill: OpexSkillDto) => void; onClose: () => void }) {
    const usage = useOpexSkillUsage(skill?.id ?? null)
    const verb = skill?.origin.kind === "github" ? "Desinstalar" : "Remover"
    const count = usage.data?.count ?? 0
    return (
        <ConfirmDialog
            open={skill !== null}
            onOpenChange={(open) => !open && onClose()}
            title={`${verb} a skill ${skill?.name ?? ""}?`}
            description={
                usage.isLoading ? (
                    <Skeleton className="h-4 w-64" />
                ) : count > 0 ? (
                    `Usada por ${count} agente(s) rotineiro(s): ela sai da seleção deles. Execuções em andamento seguem e recebem o aviso de skill indisponível.`
                ) : (
                    "Nenhum agente rotineiro usa esta skill. O conteúdo é apagado do Opex."
                )
            }
            items={usage.data?.agents.map((agent) => agent.name || agent.id)}
            confirmLabel={verb}
            variant="destructive"
            pending={pending}
            onConfirm={() => skill && onConfirm(skill)}
        />
    )
}

/** Atualizar uma ou todas (D1): hash atual → disponível; as edições locais são sobrescritas. */
export function OpexSkillUpdateDialog({ skills, pending, onConfirm, onClose }: { skills: OpexSkillDto[] | null; pending: boolean; onConfirm: (skills: OpexSkillDto[]) => void; onClose: () => void }) {
    const many = (skills?.length ?? 0) > 1
    return (
        <ConfirmDialog
            open={skills !== null}
            onOpenChange={(open) => !open && onClose()}
            title={many ? `Atualizar ${skills?.length} skills?` : `Atualizar a skill ${skills?.[0]?.name ?? ""}?`}
            description="A versão do repositório substitui o conteúdo atual (edições locais são sobrescritas). Se o GitHub falhar, a versão atual é mantida."
            items={skills?.map((skill) => `${skill.name}: ${skill.version?.installed ?? "—"} → ${skill.version?.available ?? "—"}`)}
            confirmLabel="Atualizar"
            pending={pending}
            onConfirm={() => skills && onConfirm(skills)}
        />
    )
}
