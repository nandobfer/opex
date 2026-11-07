"use client"

import { useInstanceInfo } from "@/hooks/useInstanceInfo"
import { AvailabilityNotice } from "./AvailabilityNotice"

/**
 * Aviso discreto, só numa prévia do Opex (OPE-147): o agendador automático está desligado ali e as
 * rotinas rodam no Opex original. Os disparos manuais continuam habilitados.
 */
export function PreviewSchedulerNotice() {
    const { data } = useInstanceInfo()
    return (
        <div data-testid="preview-scheduler-notice">
            <AvailabilityNotice reason={data?.preview ? data.schedulerMessage : null} />
        </div>
    )
}
