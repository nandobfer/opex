"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Bold, Code2, Eye, Heading2, Image as ImageIcon, Italic, Link2, List, Loader2, Pencil, Quote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * Envia um arquivo colado/arrastado no campo e devolve o Markdown a inserir na posição do cursor
 * (ex.: a referência do anexo). Sem esta função, colar arquivos não faz nada.
 */
export type MarkdownUploadFile = (file: File, onProgress?: (percent: number) => void) => Promise<string>

interface MarkdownFieldProps {
    id?: string
    value: string
    onChange: (value: string) => void
    rows?: number
    placeholder?: string
    invalid?: boolean
    /** Classe do contêiner. */
    className?: string
    /** Habilita colar/arrastar mídia direto no campo (ver `MarkdownUploadFile`). */
    uploadFile?: MarkdownUploadFile
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
 * citação e código) e abas Escrever/Visualizar. Reusado no formulário de tarefa (interno), na prévia
 * e no portal do cliente. Com `uploadFile`, colar ou arrastar uma mídia envia o arquivo e insere a
 * referência do anexo na posição do cursor.
 */
export function MarkdownField({ id, value, onChange, rows = 8, placeholder = "Markdown aceito", invalid, className, uploadFile }: MarkdownFieldProps) {
    const ref = useRef<HTMLTextAreaElement>(null)
    const [tab, setTab] = useState<"write" | "preview">("write")
    const [pending, setPending] = useState<{ id: string; name: string; progress: number }[]>([])
    // O valor mais recente: a inserção da referência acontece depois do envio, com o texto já digitado.
    const valueRef = useRef(value)
    useEffect(() => {
        valueRef.current = value
    }, [value])

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

    /** Insere o Markdown na posição pedida do **valor atual** (o texto digitado durante o envio fica). */
    const insertAt = (position: number, markdown: string) => {
        const current = valueRef.current
        const pos = Math.max(0, Math.min(position, current.length))
        const before = current.slice(0, pos)
        const after = current.slice(pos)
        const lead = before && !before.endsWith("\n") ? "\n\n" : ""
        const trail = after && !after.startsWith("\n") ? "\n\n" : ""
        onChange(`${before}${lead}${markdown}${trail}${after}`)
    }

    const sendFiles = (files: File[], position: number) => {
        if (!uploadFile || files.length === 0) return
        const local = files.map((file) => ({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`, name: file.name || "mídia colada", progress: 0 }))
        setPending((prev) => [...prev, ...local])
        void Promise.allSettled(
            files.map((file, index) => {
                const entry = local[index]!
                return uploadFile(file, (progress) => setPending((prev) => prev.map((item) => (item.id === entry.id ? { ...item, progress } : item))))
            }),
        ).then((results) => {
            const inserted = results.filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled").map((result) => result.value.trim()).filter(Boolean)
            if (inserted.length) insertAt(position, inserted.join("\n\n"))
            setPending((prev) => prev.filter((item) => !local.some((entry) => entry.id === item.id)))
        })
    }

    const handleFiles = (event: { preventDefault: () => void }, files: File[], position: number) => {
        if (!uploadFile || files.length === 0) return
        event.preventDefault()
        sendFiles(files, position)
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
                            <Textarea
                                ref={ref}
                                id={id}
                                rows={rows}
                                placeholder={placeholder}
                                value={value}
                                onChange={(event) => onChange(event.target.value)}
                                aria-invalid={invalid ? true : undefined}
                                className="rounded-t-none border-0 shadow-none focus-visible:ring-0"
                                onPaste={(event) => {
                                    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.size > 0)
                                    if (files.length === 0) return
                                    handleFiles(event, files, event.currentTarget.selectionStart)
                                }}
                                onDrop={(event) => {
                                    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.size > 0)
                                    if (files.length === 0) return
                                    handleFiles(event, files, event.currentTarget.selectionStart)
                                }}
                                onDragOver={(event) => {
                                    if (uploadFile) event.preventDefault()
                                }}
                            />
                        </div>
                    ) : (
                        <div className="min-h-[172px] rounded-md border bg-muted/30 p-3">
                            {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Nada para visualizar ainda.</p>}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
            <AnimatePresence>
                {pending.length > 0 && (
                    <motion.ul initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="space-y-1" aria-label="Mídias sendo enviadas">
                        {pending.map((item) => (
                            <li key={item.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                <span className="truncate" title={item.name}>
                                    Enviando {item.name}…
                                </span>
                                <span className="ml-auto shrink-0">{item.progress}%</span>
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </div>
    )
}
