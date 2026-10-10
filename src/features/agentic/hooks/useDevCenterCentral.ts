"use client"

import { useCallback } from "react"
import { usePersistentState } from "@/hooks/usePersistentState"
import { DEFAULT_DEV_CENTER_CENTRAL, DEV_CENTER_CENTRAL_KEY, devCenterCentralSchema } from "../dev-center-central"

/** Central selecionada na Central de desenvolvimento, salva no `localStorage` (não na URL). */
export function useDevCenterCentral() {
    const { value, setValue } = usePersistentState(DEV_CENTER_CENTRAL_KEY, devCenterCentralSchema, DEFAULT_DEV_CENTER_CENTRAL)
    const setCentralId = useCallback((id: string) => setValue({ id }), [setValue])
    return { centralId: value.id, setCentralId }
}
