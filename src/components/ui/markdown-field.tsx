"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Bold, Code2, Eye, Heading2, Image as ImageIcon, Italic, Link2, List, Pencil, Quote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface MarkdownFieldProps {
    id?: string
    value: string
    onChange: (value: string) => void
    rows?: number
    placeholder?: string
    invalid?: boolean
    /** Classe do contêiner. */
    className?: string
}

interface ToolAction {
    icon: typeof Bold
    label: string
    apply: (selected: string) => { before: string; after: string; placeholder: string }
}

const TOOLS: ToolAction[] = [
    { icon: Bold, label: "Negrito", apply: (s) => ({ before: "**", after: "**", placeholder: s || "texto" }) },
    { icon: Italic, label: "Itálico", apply: (s) => ({ before: "_", after: "_", placeholder: s || "texto" }) },
    { icon: Heading2, label: "Cabeçalho", apply: (s) => ({ before: "## ", after: "", placeholder: s || "Título" }) },
    { icon: Link2, label: "Link", apply: (s) => ({ before: "[", after: "](https://)", placeholder: s || "texto do link" }) },
    { icon: ImageIcon, label: "Imagem", apply: (s) => ({ before: "![", after: "](https://)", placeholder: s || "descrição" }) },
    { icon: List, label: "Lista", apply: (s) => ({ before: "- ", after: "", placeholder: s || "item" }) },
    { icon: Quote, label: "Citação", apply: (s) => ({ before: "> ", after: "", placeholder: s || "citação" }) },
    { icon: Code2, label: "Código", apply: (s) => ({ before: "`", after: "`", placeholder: s || "código" }) },
]

/**
 * Campo de texto Markdown com barra de formatação (negrito, itálico, título, link, imagem, lista,
 * citação e código) e abas Escrever/Visualizar. Reusado no formulário de tarefa (interno) e no
 * portal do cliente.
 */
export function MarkdownField({ id, value, onChange, rows = 8, placeholder = "Markdown aceito", invalid, className }: MarkdownFieldProps) {
    const ref = useRef<HTMLTextAreaElement>(null)
    const [tab, setTab] = useState<"write" | "preview">("write")

    const apply = (tool: ToolAction) => {
        const el = ref.current
        if (!el) return
        const start = el.selectionStart
        const end = el.selectionEnd
        const selected = value.slice(start, end)
        const { before, after, placeholder: ph } = tool.apply(selected)
        const body = selected || ph
        const next = value.slice(0, start) + before + body + after + value.slice(end)
        onChange(next)
        requestAnimationFrame(() => {
            el.focus()
            const caret = start + before.length + body.length
            el.setSelectionRange(caret, caret)
        })
    }

    return (
        <div className={cn("space-y-2", className)}>
            <div role="tablist" aria-label="Editar ou visualizar a descrição" className="flex gap-1 rounded-lg bg-muted p-1">
                {(
                    [
                        { id: "write", label: "Escrever", icon: Pencil },
                        { id: "preview", label: "Visualizar", icon: Eye },
                    ] as const
                ).map((item) => {
                    const active = tab === item.id
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setTab(item.id)}
                            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            <item.icon className="h-3.5 w-3.5" aria-hidden />
                            {item.label}
                        </button>
                    )
                })}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                    {tab === "write" ? (
                        <div className="rounded-md border focus-within:ring-2 focus-within:ring-ring">
                            <div className="flex flex-wrap gap-0.5 border-b p-1" role="toolbar" aria-label="Formatação">
                                {TOOLS.map((tool) => (
                                    <Button key={tool.label} type="button" variant="ghost" size="icon" className="h-7 w-7" title={tool.label} aria-label={tool.label} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(tool)}>
                                        <tool.icon className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                ))}
                            </div>
                            <Textarea ref={ref} id={id} rows={rows} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={invalid ? true : undefined} className="rounded-t-none border-0 shadow-none focus-visible:ring-0" />
                        </div>
                    ) : (
                        <div className="min-h-[172px] rounded-md border bg-muted/30 p-3">
                            {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Nada para visualizar ainda.</p>}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
