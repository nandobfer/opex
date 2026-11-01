import { describe, expect, it } from 'vitest'
import { parseArchitectOutput } from '@/features/architect-agent/parse'
import { buildArchitectInstructions, buildDiagramPrompt, buildRepairPrompt } from '@/features/architect-agent/prompt'
import { sampleGraph } from './fixtures'

/** Leitura da resposta do arquiteto e as mensagens da sessão (instruções, pedido e correção). */

describe('parseArchitectOutput', () => {
  it('lê o último bloco JSON com o grafo', () => {
    const text = 'Primeiro:\n```json\n{"nodes":[{"id":"a"}]}\n```\nCorrigido:\n```json\n{"title":"Final","nodes":[{"id":"b","label":"B"}]}\n```'
    const parsed = parseArchitectOutput(text)
    expect(parsed.ok && parsed.raw.title).toBe('Final')
  })

  it('recusa texto sem bloco, JSON inválido e nós vazios, com o motivo em pt-BR', () => {
    expect(parseArchitectOutput('sem json')).toEqual({ ok: false, error: 'a resposta não trouxe um bloco JSON com o grafo' })
    expect(parseArchitectOutput('```json\n{nodes: [}\n```')).toEqual({ ok: false, error: 'o bloco JSON da resposta não é um JSON válido' })
    const empty = parseArchitectOutput('```json\n{"nodes":[]}\n```')
    expect(empty.ok).toBe(false)
    expect(!empty.ok && empty.error).toContain('nodes')
  })
})

describe('prompts do arquiteto', () => {
  it('as instruções trazem as regras de leitura, o escopo do plano, as memórias e as instruções adicionais', () => {
    const text = buildArchitectInstructions({ instructions: 'Destaque o Pusher', memories: '- Camadas X', selfMemory: false })
    expect(text).toContain('NUNCA altere arquivos')
    expect(text).toContain('Escopo: somente o que o plano toca')
    expect(text).toContain('Destaque o Pusher')
    expect(text).toContain('- Camadas X')
    expect(text).not.toContain('Memória própria')
  })

  it('o pedido traz a diretiva e o teto do nível, a tarefa, o plano e o diretório', () => {
    const text = buildDiagramPrompt({ code: 'OPE-1', title: 'T', description: 'Desc', technicalSpec: 'Spec', planVersion: 2, plan: '# Plano v2', directory: '/repo/worktrees/ope-1', worktree: true, depth: 4 })
    expect(text).toContain('nível 4 — Detalhado')
    expect(text).toContain('No máximo 70 nós')
    expect(text).toContain('# Plano v2')
    expect(text).toContain('worktree da mesa: /repo/worktrees/ope-1')
    expect(text).toContain('Spec')
    expect(text).not.toContain('Ajuste pedido')
  })

  it('sem worktree, manda ler a base; no ajuste, leva o grafo anterior e o pedido', () => {
    const text = buildDiagramPrompt({ code: 'OPE-1', title: 'T', description: null, technicalSpec: null, planVersion: 1, plan: 'P', directory: '/repo', worktree: false, depth: 3, adjust: { graph: sampleGraph(), feedback: 'expanda o fluxo de autenticação' } })
    expect(text).toContain('base do repositório em /repo')
    expect(text).toContain('expanda o fluxo de autenticação')
    expect(text).toContain('"id":"tab"')
  })

  it('o pedido de correção leva o erro e o teto', () => {
    expect(buildRepairPrompt('o JSON não segue o formato', 1)).toContain('o JSON não segue o formato')
    expect(buildRepairPrompt('x', 1)).toContain('no máximo 8 nós')
  })
})
