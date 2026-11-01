"use client"

import { useState } from "react"
import { useReactFlow } from "@xyflow/react"
import { Download, FileDown, ImageDown, Loader2, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { copyText } from "@/lib/clipboard"
import type { ArchitectGraph } from "../../graph"
import { toMarkdown, toMermaid } from "../../mermaid"
import { downloadDiagramImage } from "./export-image"

/** Exportar: copiar Mermaid (o GitHub renderiza em issue/PR), copiar Markdown e baixar imagem. */
export function ArchitectExportMenu({ graph, fileName, container }: { graph: ArchitectGraph; fileName: string; container: () => HTMLElement | null }) {
    const flow = useReactFlow()
    const [busy, setBusy] = useState(false)
    const copy = async (text: string, what: string) => ((await copyText(text)) ? toast.success(`${what} copiado`) : toast.error("Não foi possível copiar: selecione e copie manualmente."))
    const image = async () => {
        const element = container()
        if (!element) return
        setBusy(true)
        try {
            await downloadDiagramImage(element, flow.getNodes(), `${fileName}.png`)
        } catch (error) {
            toast.error(`Não foi possível gerar a imagem: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setBusy(false)
        }
    }
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 bg-transparent" disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Share2 className="h-3.5 w-3.5" aria-hidden />} Exportar
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void copy(toMermaid(graph), "Mermaid")}>
                    <FileDown className="mr-2 h-4 w-4" aria-hidden /> Copiar Mermaid
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void copy(toMarkdown(graph), "Markdown")}>
                    <Download className="mr-2 h-4 w-4" aria-hidden /> Copiar Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void image()}>
                    <ImageDown className="mr-2 h-4 w-4" aria-hidden /> Baixar imagem
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
