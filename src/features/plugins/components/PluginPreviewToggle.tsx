"use client"

import { Eye } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { usePluginRuntime, useTogglePluginPreview } from "../hooks/usePlugins"

/**
 * "Ligar prévia" de um plugin (OPE-172): a versão `preview` passa a aparecer SÓ neste navegador
 * (cookie assinado); o resto continua na `stable`. Usado na mesa, na tela de Plugins e no portal.
 */
export function PluginPreviewToggle({ pluginId, previewUrl = null, layout = "bar", className }: { pluginId: string; previewUrl?: string | null; layout?: "bar" | "sheet"; className?: string }) {
    const runtime = usePluginRuntime()
    const toggle = useTogglePluginPreview(pluginId)
    const on = runtime.data?.previewOn.includes(pluginId) ?? false
    const id = `plugin-preview-${pluginId}`
    const hint = on ? "Ligada: este navegador vê a versão em prévia do plugin (os outros continuam na estável)" : "Desligada: este navegador vê a versão estável do plugin"
    return (
        <div className={cn("flex shrink-0 items-center gap-2", layout === "sheet" && "justify-between rounded-md border px-3 py-2", className)}>
            <label htmlFor={id} className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground" title={hint}>
                Ligar prévia
            </label>
            <Switch id={id} checked={on} disabled={toggle.isPending || runtime.isPending} onCheckedChange={(checked) => toggle.mutate(checked)} aria-describedby={`${id}-hint`} className="h-5 w-9 after:h-4 after:w-4" />
            <span id={`${id}-hint`} className="sr-only">
                {hint}
            </span>
            {previewUrl && on && (
                <a href={previewUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    Ver prévia
                </a>
            )}
        </div>
    )
}
