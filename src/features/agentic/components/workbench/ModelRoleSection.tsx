"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { AiModelDto } from "@/lib/ai/providers"
import { cn } from "@/lib/utils"
import type { AgentRole } from "../../constants"
import type { ModelChoiceDto } from "../../types"
import { AgentRoleSection } from "../settings/AgentRoleSection"
import { RoleModelOverrideFields } from "./RoleModelOverrideFields"
import type { ModelVariantValue } from "@/features/ai/components/model-picker/ModelVariantFields"

interface ModelRoleSectionProps {
    id: string
    role: AgentRole
    /** Título no lugar do rótulo do papel (ex.: "Este fork"). */
    title?: string
    description?: string
    choice: ModelChoiceDto
    /** Etapa em que a mesa está (badge "Etapa atual"). */
    current?: boolean
    /** Gravando a troca desta etapa (destaque + "Alterando"). */
    pending?: boolean
    inheritLabel: string
    customLabel: string
    models: { data?: AiModelDto[]; isError?: boolean; isLoading: boolean; error?: unknown }
    onChange: (input: ModelVariantValue) => void
}

/** Uma etapa no popover de modelos: título do papel, "Etapa atual", indicador de gravação e os campos. */
export function ModelRoleSection({ id, role, title, description, choice, current = false, pending = false, inheritLabel, customLabel, models, onChange }: ModelRoleSectionProps) {
    return (
        <AgentRoleSection
            id={id}
            role={role}
            title={title}
            description={description}
            className={cn("rounded-md border border-transparent px-2 transition-colors first:pt-2 last:pb-2", (pending || current) && "border-primary/40", pending && "bg-primary/5")}
            badge={
                <>
                    {current && (
                        <Badge variant="outline" className="border-primary/60 px-2 py-0 text-[10px] font-medium text-primary">
                            Etapa atual
                        </Badge>
                    )}
                    <AnimatePresence initial={false}>
                        {pending && (
                            <motion.span key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="ml-auto flex items-center gap-1 text-[11px] text-primary">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                Alterando
                            </motion.span>
                        )}
                    </AnimatePresence>
                </>
            }
        >
            <RoleModelOverrideFields id={id} choice={choice} models={models} inheritLabel={inheritLabel} customLabel={customLabel} onChange={onChange} />
        </AgentRoleSection>
    )
}
