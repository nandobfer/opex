"use client"

import { useMemo, type ReactNode } from "react"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"
import { useTechCatalog } from "../../hooks/useProjectBootstrap"
import type { DetectedTechGroup } from "../../tech-detect"
import type { ProjectBootstrapDto } from "../../types"
import { TechBadges } from "../TechBadges"

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-sm">{children}</dd>
        </div>
    )
}

/** Etapa 1 só para leitura: o que foi enviado ao agente. */
export function InfoPanel({ bootstrap }: { bootstrap: ProjectBootstrapDto }) {
    const catalog = useTechCatalog()
    const board = useTaskBoard()
    const column = (key: string | null) => (key ? (board.columns.find((item) => item.key === key)?.label ?? key) : "Sem coluna de conclusão")
    // Os badges gravados no envio, com as cores atuais dos grupos.
    const groups = useMemo<DetectedTechGroup[]>(() => {
        const byName = new Map((catalog.data?.groups ?? []).map((group) => [group.name, group]))
        const grouped = new Map<string, DetectedTechGroup>()
        bootstrap.technologies.forEach((tech, index) => {
            const group = byName.get(tech.group) ?? { id: tech.group, name: tech.group, color: "", order: 999, count: 0 }
            const entry = grouped.get(group.name) ?? { group, technologies: [] }
            entry.technologies.push({ id: `${tech.name}-${index}`, name: tech.name })
            grouped.set(group.name, entry)
        })
        return [...grouped.values()].sort((a, b) => a.group.order - b.group.order)
    }, [bootstrap.technologies, catalog.data])
    return (
        <dl className="space-y-3">
            <Row label="Repositório">
                <span className="font-mono">{bootstrap.repo}</span> · {bootstrap.mode === "new" ? "novo" : "existente"} · {bootstrap.visibility === "private" ? "privado" : "público"} · branch <span className="font-mono">{bootstrap.branch}</span>
            </Row>
            <Row label="Diretório no host">
                <span className="font-mono">{bootstrap.directory}</span>
            </Row>
            <Row label="Colunas do vínculo">
                Entrada: {column(bootstrap.entryColumnKey)} · Conclusão: {column(bootstrap.closedColumnKey)}
            </Row>
            <Row label="Contexto">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{bootstrap.context}</p>
            </Row>
            <Row label="Tecnologias">
                <TechBadges groups={groups} emptyText="Nenhuma tecnologia reconhecida no contexto." />
            </Row>
        </dl>
    )
}
