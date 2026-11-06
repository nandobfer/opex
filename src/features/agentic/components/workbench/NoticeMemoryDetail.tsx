"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { OptionTabs } from "@/components/ui/option-tabs"
import { MemoryDetailCard } from "@/features/ai/components/memories/MemoryDetailCard"
import { MemoryDetailPopover } from "@/features/ai/components/memories/MemoryDetailPopover"
import { MentorSuggestionDetail } from "@/features/adversarial-agent/components/mentor/MentorSuggestionDetail"
import type { WorkbenchNoticeMemoryRef } from "../../types"

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.15 } }

function RefDetail({ memoryRef }: { memoryRef: WorkbenchNoticeMemoryRef }) {
    return memoryRef.kind === "suggestion" ? <MentorSuggestionDetail suggestion={memoryRef} /> : <MemoryDetailCard memoryRef={memoryRef} />
}

/** Conteúdo do painel: uma memória, ou abas "Principal" e "Parte separada" (lição dividida pelo Mentor). */
function NoticeMemoryPanel({ memories }: { memories: WorkbenchNoticeMemoryRef[] }) {
    const [index, setIndex] = useState("0")
    if (memories.length === 1) return <RefDetail memoryRef={memories[0]!} />
    const current = memories[Number(index)] ?? memories[0]!
    return (
        <div className="space-y-2.5">
            <OptionTabs
                aria-label="Memória do aviso"
                size="xs"
                options={memories.map((_, position) => ({ value: String(position), label: position === 0 ? "Principal" : "Parte separada" }))}
                value={index}
                onChange={setIndex}
                className="mr-6"
            />
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={index} {...fade}>
                    <RefDetail memoryRef={current} />
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

/** Texto do aviso de memória com o painel de detalhe (hover abre, clique fixa). */
export function NoticeMemoryDetail({ message, memories }: { message: string; memories: WorkbenchNoticeMemoryRef[] }) {
    return (
        <MemoryDetailPopover label={memories.length > 1 ? "Memórias do aviso" : "Memória do aviso"} content={() => <NoticeMemoryPanel memories={memories} />}>
            {message}
        </MemoryDetailPopover>
    )
}
