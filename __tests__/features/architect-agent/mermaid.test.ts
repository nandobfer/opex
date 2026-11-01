import { describe, expect, it } from 'vitest'
import { mermaidText, toMarkdown, toMermaid } from '@/features/architect-agent/mermaid'
import { sampleGraph } from './fixtures'

/** Exportação Mermaid (renderizada pelo GitHub) e Markdown. */

describe('toMermaid', () => {
  it('gera flowchart LR com um subgraph por grupo, ids seguros e classes de novo/alterado', () => {
    const text = toMermaid(sampleGraph())
    const lines = text.split('\n')
    expect(lines[0]).toBe('flowchart LR')
    expect(text).toContain('subgraph g1["UI"]')
    expect(text.match(/subgraph/g)).toHaveLength(3)
    expect(text.match(/^\s+end$/gm)).toHaveLength(3)
    expect(text).toContain('n1(["Diagrama do plano"])')
    expect(text).toContain('n5[("architect_diagrams")]')
    expect(text).toContain('n6{{"Pusher"}}')
    expect(text).toContain('n1 ==> n2')
    expect(text).toContain('n4 -.->|"evento"| n6')
    expect(text).toContain('class n1,n2,n4,n5 new')
    expect(text).toContain('class n3 changed')
    expect(text).not.toContain('objective')
  })

  it('escapa aspas, #, < > e quebras de linha', () => {
    expect(mermaidText('Aba "X" #1 <b>\nfim')).toBe('Aba #quot;X#quot; #35;1 #lt;b#gt; fim')
    expect(toMermaid(sampleGraph())).toContain('n2["Aba #quot;Arquitetura#quot;"]')
  })
})

describe('toMarkdown', () => {
  it('traz título, resumo, a cerca mermaid, notas e a tabela de nós', () => {
    const text = toMarkdown(sampleGraph())
    expect(text).toContain('## Agente Arquiteto')
    expect(text).toContain('```mermaid\nflowchart LR')
    expect(text).toContain('- **Risco:** Layout de grupos no dagre')
    expect(text).toContain('| Aba "Arquitetura" | Módulo | Novo | `src/features/architect-agent/components/workbench/ArchitectTab.tsx` |')
  })
})
