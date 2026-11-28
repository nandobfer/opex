"use client"

import { ExternalLink } from "lucide-react"
import { CopyButton } from "@/components/ui/copy-button"
import { cn } from "@/lib/utils"
import { PORT_REACH_HINTS, portLink, type ContainerPortDto } from "../../container-ports"

/** Uma porta do container: "3000/tcp → :4100", com a publicada como link e o botão de copiar o link. */
export function PortChip({ port, host }: { port: ContainerPortDto; host: string }) {
    const link = portLink(port, host)
    const target = `${port.container}/${port.protocol}`
    return (
        <span className="inline-flex items-center gap-0.5 rounded-md border bg-background/40 py-0.5 pl-2 pr-0.5 font-mono text-xs" title={PORT_REACH_HINTS[port.reach]} data-reach={port.reach}>
            <span className="text-muted-foreground">{target}</span>
            {port.published !== null && <span className="px-1 text-muted-foreground" aria-hidden>→</span>}
            {port.published !== null &&
                (link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Abrir ${link}`}>
                        :{port.published}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                ) : (
                    <span className={cn("text-foreground", port.reach !== "link" && "text-muted-foreground")}>:{port.published}</span>
                ))}
            {link ? <CopyButton value={link} label={`Copiar o link ${link}`} successMessage="Link copiado." className="h-6 w-6" /> : <span className="w-1.5" aria-hidden />}
        </span>
    )
}
