"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FORK_STATUS_LABELS } from "../../constants"
import { forkTree } from "../../fork-logic"
import type { ForkDto, WorkbenchDto } from "../../types"
import { ForkPanel } from "./ForkPanel"
import { ForkStatusBadge } from "./ForkStatusBadge"

/** Rótulo do fork no seletor: "Fork N · de Fork M · Estado". */
const optionLabel = (fork: ForkDto) => [`Fork ${fork.number}`, fork.parentNumber !== null ? `de Fork ${fork.parentNumber}` : null, FORK_STATUS_LABELS[fork.status]].filter(Boolean).join(" · ")

/**
 * Aba "Forks": seletor dos forks da mesa em árvore (cada fork seguido dos filhos, recuados por nível;
 * o mais recente por padrão) e o fork escolhido.
 */
export function ForkView({ workbench, forks, selectedId, onSelect }: { workbench: WorkbenchDto; forks: ForkDto[]; selectedId: string | null; onSelect: (id: string) => void }) {
    const fork = forks.find((item) => item.id === selectedId) ?? [...forks].sort((a, b) => a.number - b.number).at(-1)
    if (!fork) return null
    const parentDoc = fork.parentForkId ? (forks.find((item) => item.id === fork.parentForkId) ?? null) : null
    const parent = fork.parentNumber !== null ? { id: parentDoc?.id ?? null, number: fork.parentNumber, status: parentDoc?.status ?? null } : null
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                    Fork {fork.number} <ForkStatusBadge status={fork.status} runState={fork.runState} />
                </span>
                {forks.length > 1 && (
                    <Select value={fork.id} onValueChange={onSelect}>
                        <SelectTrigger className="w-64" aria-label="Fork exibido">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {forkTree(forks).map(({ fork: item, depth }) => (
                                <SelectItem key={item.id} value={item.id}>
                                    <span style={{ paddingLeft: `${depth * 0.75}rem` }}>
                                        {depth > 0 ? "↳ " : ""}
                                        {optionLabel(item)}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={fork.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="flex min-h-0 flex-1 flex-col">
                    <ForkPanel workbench={workbench} fork={fork} parent={parent} onSelectFork={onSelect} />
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
