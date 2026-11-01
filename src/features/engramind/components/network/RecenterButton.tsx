"use client"

import { Panel } from "@xyflow/react"
import { Crosshair } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NETWORK_TOUCH_BUTTON_CLASS } from "./layout-classes"
import { useRecenter } from "./NetworkCanvas"

/** "Centralizar": reenquadra a visão (dentro do canvas, onde o React Flow está disponível). */
export function RecenterButton() {
    const recenter = useRecenter()
    return (
        <Panel position="bottom-right">
            <Button type="button" size="sm" variant="outline" className={cn("bg-card/90", NETWORK_TOUCH_BUTTON_CLASS)} onClick={recenter}>
                <Crosshair className="mr-1.5 h-4 w-4" aria-hidden /> Centralizar
            </Button>
        </Panel>
    )
}
