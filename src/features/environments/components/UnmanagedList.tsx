"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Boxes, GitBranch, Monitor, Server } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import type { UnmanagedProjectDto } from "../types"

/** Projetos do compose descobertos pelos labels nos dois Dockers e ainda não gerenciados. */
export function UnmanagedList({ projects, onAdopt }: { projects: UnmanagedProjectDto[]; onAdopt: (project: UnmanagedProjectDto) => void }) {
    if (!projects.length) return null
    return (
        <CadastroTableCard>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <Boxes className="h-4 w-4" aria-hidden /> Não gerenciados
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">Projetos do Docker Compose em execução que o opex ainda não gerencia. Adote para fazer deploy, logs e mover por aqui (sem git, o redeploy só refaz o build).</p>
            <ul className="divide-y">
                <AnimatePresence initial={false}>
                    {projects.map((project) => {
                        const Icon = project.machine === "pc" ? Monitor : Server
                        return (
                            <motion.li key={`${project.machine}-${project.projectName}`} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex items-center gap-3 py-2">
                                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={project.machine === "pc" ? "PC" : "Servidor"} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{project.projectName}</span>
                                    <span className="block truncate font-mono text-xs text-muted-foreground">{project.workingDir ?? "pasta desconhecida"}</span>
                                </span>
                                <Badge variant="outline" className="gap-1">
                                    {project.git && <GitBranch className="h-3 w-3" aria-hidden />}
                                    {project.git ? "git" : "sem git"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    {project.running}/{project.containers} no ar
                                </span>
                                <Button type="button" size="sm" variant="outline" disabled={!project.workingDir} title={project.workingDir ? undefined : "Sem a pasta do compose nos labels"} onClick={() => onAdopt(project)}>
                                    Adotar
                                </Button>
                            </motion.li>
                        )
                    })}
                </AnimatePresence>
            </ul>
        </CadastroTableCard>
    )
}
