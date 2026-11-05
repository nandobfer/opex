"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { ROUTINE_AGENT_STATUS_LABELS, ROUTINE_PROVISIONING_LABELS, ROUTINE_RUN_STATUS_LABELS, type RoutineAgentStatus, type RoutineProvisioningStatus, type RoutineRunStatus } from "../status"

type Variant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"

const AGENT_VARIANT: Record<RoutineAgentStatus, Variant> = { active: "success", paused: "warning", archived: "secondary" }
const PROVISIONING_VARIANT: Record<RoutineProvisioningStatus, Variant> = { pending: "outline", running: "info", ok: "outline", error: "destructive" }
const RUN_VARIANT: Record<RoutineRunStatus, Variant> = {
    queued: "outline",
    running: "info",
    waiting: "info",
    hibernating: "secondary",
    awaiting_confirmation: "warning",
    completed: "success",
    error: "destructive",
    canceled: "secondary",
    expired: "secondary",
}

/** Troca de status animada (o rótulo muda com fade). */
function AnimatedBadge({ id, label, variant }: { id: string; label: string; variant: Variant }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.span key={id} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.15 }} className="inline-flex">
                <Badge variant={variant} className="whitespace-nowrap">
                    {label}
                </Badge>
            </motion.span>
        </AnimatePresence>
    )
}

export const RoutineAgentStatusBadge = ({ status }: { status: RoutineAgentStatus }) => <AnimatedBadge id={status} label={ROUTINE_AGENT_STATUS_LABELS[status]} variant={AGENT_VARIANT[status]} />

/** Só aparece fora do "Provisionado" (o normal não precisa de selo). */
export const RoutineProvisioningBadge = ({ status }: { status: RoutineProvisioningStatus }) => (status === "ok" ? null : <AnimatedBadge id={status} label={ROUTINE_PROVISIONING_LABELS[status]} variant={PROVISIONING_VARIANT[status]} />)

export const RoutineRunStatusBadge = ({ status }: { status: RoutineRunStatus }) => <AnimatedBadge id={status} label={ROUTINE_RUN_STATUS_LABELS[status]} variant={RUN_VARIANT[status]} />
