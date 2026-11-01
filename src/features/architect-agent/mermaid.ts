import { ARCHITECT_NODE_KIND_LABELS, ARCHITECT_NODE_STATUS_LABELS, ARCHITECT_NOTE_KIND_LABELS, type ArchitectEdgeKind, type ArchitectNodeKind } from "./constants"
import type { ArchitectGraph } from "./graph"

/**
 * Exportação do grafo (módulo PURO): Mermaid `flowchart LR` (o GitHub renderiza em issue/PR) e um
 * Markdown com resumo, diagrama, notas e a tabela de nós. Ids viram `n1…`/`g1…` (os do modelo podem
 * ter caracteres que o Mermaid não aceita) e os rótulos vão entre aspas, escapados.
 */

/** Texto seguro dentro de `"..."` no Mermaid (entidades `#quot;`/`#35;`, sem quebras de linha). */
export function mermaidText(value: string): string {
    return value
        .replace(/\s+/g, " ")
        .trim()
        .replace(/#/g, "#35;")
        .replace(/"/g, "#quot;")
        .replace(/</g, "#lt;")
        .replace(/>/g, "#gt;")
}

const SHAPES: Record<ArchitectNodeKind, [string, string]> = {
    objective: ["([", "])"],
    module: ["[", "]"],
    route: ["[/", "/]"],
    feature: ["[", "]"],
    lib: ["[[", "]]"],
    data: ["[(", ")]"],
    external: ["{{", "}}"],
    decision: ["{", "}"],
    risk: [">", "]"],
}

const ARROWS: Record<ArchitectEdgeKind, string> = { contains: "---", uses: "-->", flow: "==>", event: "-.->", data: "-->" }

export function toMermaid(graph: ArchitectGraph): string {
    const nodeIds = new Map(graph.nodes.map((node, index) => [node.id, `n${index + 1}`]))
    const lines = ["flowchart LR"]
    const nodeLine = (node: ArchitectGraph["nodes"][number], indent: string) => {
        const [open, close] = SHAPES[node.kind]
        return `${indent}${nodeIds.get(node.id)}${open}"${mermaidText(node.label)}"${close}`
    }
    graph.groups.forEach((group, index) => {
        const members = graph.nodes.filter((node) => node.groupId === group.id)
        if (!members.length) return
        lines.push(`    subgraph g${index + 1}["${mermaidText(group.label)}"]`)
        members.forEach((node) => lines.push(nodeLine(node, "        ")))
        lines.push("    end")
    })
    graph.nodes.filter((node) => !node.groupId || !graph.groups.some((group) => group.id === node.groupId)).forEach((node) => lines.push(nodeLine(node, "    ")))
    for (const edge of graph.edges) {
        const source = nodeIds.get(edge.source)
        const target = nodeIds.get(edge.target)
        if (!source || !target) continue
        const label = edge.label ? `|"${mermaidText(edge.label)}"|` : ""
        lines.push(`    ${source} ${ARROWS[edge.kind]}${label} ${target}`)
    }
    const byStatus = (status: "new" | "changed") => graph.nodes.filter((node) => node.status === status).map((node) => nodeIds.get(node.id))
    const created = byStatus("new")
    const changed = byStatus("changed")
    if (created.length) lines.push("    classDef new stroke-width:3px", `    class ${created.join(",")} new`)
    if (changed.length) lines.push("    classDef changed stroke-dasharray:4 2,stroke-width:2px", `    class ${changed.join(",")} changed`)
    return lines.join("\n")
}

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim()

export function toMarkdown(graph: ArchitectGraph): string {
    const parts = [`## ${graph.title}`]
    if (graph.summary) parts.push("", graph.summary)
    parts.push("", "```mermaid", toMermaid(graph), "```")
    if (graph.notes.length) {
        parts.push("", "### Notas", ...graph.notes.map((note) => `- **${ARCHITECT_NOTE_KIND_LABELS[note.kind]}:** ${cell(note.text)}`))
    }
    parts.push("", "### Nós", "", "| Nó | Tipo | Situação | Arquivos |", "|---|---|---|---|")
    for (const node of graph.nodes) {
        const files = node.files.length ? node.files.map((file) => `\`${cell(file)}\``).join(", ") : "—"
        parts.push(`| ${cell(node.label)} | ${ARCHITECT_NODE_KIND_LABELS[node.kind]} | ${ARCHITECT_NODE_STATUS_LABELS[node.status]} | ${files} |`)
    }
    return parts.join("\n")
}
