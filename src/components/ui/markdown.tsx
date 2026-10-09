"use client"

import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

/**
 * Markdown (GFM: tabelas, listas de tarefa, tachado) com o estilo do tema. HTML cru é ignorado
 * (padrão do react-markdown) e links externos abrem em nova aba.
 */
/** Tira a prop `node` (AST) que o react-markdown repassa e o DOM não aceita. */
function rest<P extends { node?: unknown }>(props: P): Omit<P, "node"> {
    const { node, ...others } = props
    void node
    return others
}

const components: Components = {
    h1: (props) => <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0" {...rest(props)} />,
    h2: (props) => <h4 className="mb-2 mt-4 text-sm font-semibold first:mt-0" {...rest(props)} />,
    h3: (props) => <h5 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0" {...rest(props)} />,
    h4: (props) => <h6 className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide first:mt-0" {...rest(props)} />,
    p: (props) => <p className="mb-2 leading-relaxed last:mb-0" {...rest(props)} />,
    ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...rest(props)} />,
    ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...rest(props)} />,
    li: (props) => <li className="leading-relaxed [&>input]:mr-1.5 [&>input]:accent-primary" {...rest(props)} />,
    a: (props) => <a className="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noreferrer noopener" {...rest(props)} />,
    blockquote: (props) => <blockquote className="mb-2 border-l-2 border-primary/50 pl-3 text-muted-foreground" {...rest(props)} />,
    code: (props) => <code {...rest(props)} className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]", props.className)} />,
    pre: (props) => <pre className="mb-2 overflow-x-auto rounded-md border bg-muted/60 p-3 text-xs [&>code]:bg-transparent [&>code]:p-0" {...rest(props)} />,
    table: (props) => (
        <div className="mb-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs" {...rest(props)} />
        </div>
    ),
    th: (props) => <th className="border px-2 py-1 text-left font-semibold" {...rest(props)} />,
    td: (props) => <td className="border px-2 py-1 align-top" {...rest(props)} />,
    hr: () => <hr className="my-3 border-border" />,
}

export function Markdown({ children, className }: { children: string; className?: string }) {
    return (
        <div className={cn("break-words text-sm text-foreground/90", className)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {children}
            </ReactMarkdown>
        </div>
    )
}
