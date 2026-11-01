"use client"

import { Panel } from "@xyflow/react"
import { Crosshair } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRecenter } from "./NetworkCanvas"

/** "Centralizar": reenquadra a visão (dentro do canvas, onde o React Flow está disponível). */
export function RecenterButton() {
    const recenter = useRecenter()
    return (
        <Panel position="bottom-right">
            <Button type="button" size="sm" variant="outline" className="bg-card/90" onClick={recenter}>
                <Crosshair className="mr-1.5 h-4 w-4" aria-hidden /> Centralizar
            </Button>
        </Panel>
    )
}
