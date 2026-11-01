"use client"

import { Panel } from "@xyflow/react"
import { Brain, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NETWORK_TOUCH_BUTTON_CLASS } from "./layout-classes"

/** Ação de criar no canto (universo com memórias) e o estado vazio com a mesma ação. */
export function UniversePanels({ count, onCreate, createLabel, emptyTitle }: { count: number; onCreate?: (() => void) | null; createLabel?: string; emptyTitle: string }) {
    return (
        <>
            {onCreate && createLabel && count > 0 && (
                <Panel position="top-left">
                    <Button type="button" size="sm" variant="outline" className={cn("bg-card/90", NETWORK_TOUCH_BUTTON_CLASS)} onClick={onCreate}>
                        <Plus className="mr-1 h-4 w-4" aria-hidden /> {createLabel}
                    </Button>
                </Panel>
            )}
            {count === 0 && (
                <Panel position="bottom-center" className="!mb-10">
                    <div className="flex flex-col items-center gap-2 rounded-xl border bg-card/90 p-4 text-center shadow" data-testid="universe-empty">
                        <Brain className="h-6 w-6 text-muted-foreground" aria-hidden />
                        <p className="text-sm font-medium">{emptyTitle}</p>
                        {onCreate && (
                            <Button type="button" size="sm" variant="outline" className={NETWORK_TOUCH_BUTTON_CLASS} onClick={onCreate}>
                                <Plus className="mr-1 h-4 w-4" aria-hidden /> Nova memória
                            </Button>
                        )}
                    </div>
                </Panel>
            )}
        </>
    )
}
