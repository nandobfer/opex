import { describe, expect, it } from 'vitest'
import { parseArchitectOutput } from '@/features/architect-agent/parse'
import { buildArchitectInstructions, buildDiagramPrompt, buildIdeaRepairPrompt, buildRepairPrompt, depthDirective } from '@/features/architect-agent/prompt'
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
    expect(text).toContain('ARQUITETURA DA IDEIA')
    expect(text).toContain('Escopo e vocabulário: ideias, processos e estruturas')
    // Diagrama de ideias: proíbe nomes de código e não pede arquivos nem caminhos.
    expect(text).toContain('PROIBIDO em qualquer texto')
    expect(text).not.toContain('files')
    expect(text).not.toContain('src/')
    expect(text).not.toMatch(/caminhos? REA/)
    expect(text).toContain('`actor`')
    expect(text).toContain('`process`')
    expect(text).toContain('`structure`')
    expect(text).toContain('`information`')
    expect(text).toContain('Destaque o Pusher')
    expect(text).toContain('- Camadas X')
    expect(text).not.toContain('Memória própria')
    // O limite do detalhe do nó é informado ao modelo (o excedente é cortado no saneamento).
    expect(text).toContain('descrição de nó até 400')
    expect(text).toContain('nota até 500')
    expect(text).toContain('resumo até 600')
    // Formato ao vivo: uma operação por linha, escrita aos poucos, terminando com done.
    expect(text).toContain('```architect')
    expect(text).toContain('{"op":"node","id":"objective"')
    expect(text).toContain('Escreva aos POUCOS')
    expect(text).toContain('Termine o último bloco com `{"op":"done"}`')
  })

  it('o pedido traz a diretiva e o teto do nível, a tarefa, o plano e o diretório', () => {
    const text = buildDiagramPrompt({ code: 'OPE-1', title: 'T', description: 'Desc', technicalSpec: 'Spec', planVersion: 2, plan: '# Plano v2', directory: '/repo/worktrees/ope-1', worktree: true, depth: 4 })
    expect(text).toContain('nível 4 — Detalhado')
    expect(text).toContain('No máximo 18 nós')
    expect(text).toContain('# Plano v2')
    expect(text).toContain('worktree da mesa: /repo/worktrees/ope-1')
    expect(text).toContain('Spec')
    expect(text).not.toContain('Ajuste pedido')
    expect(text).toContain('blocos ```architect')
  })

  it('sem worktree, manda ler a base; no ajuste, leva o grafo anterior e o pedido', () => {
    const text = buildDiagramPrompt({ code: 'OPE-1', title: 'T', description: null, technicalSpec: null, planVersion: 1, plan: 'P', directory: '/repo', worktree: false, depth: 3, adjust: { graph: sampleGraph(), feedback: 'expanda o fluxo de autenticação' } })
    expect(text).toContain('base do repositório em /repo')
    expect(text).toContain('expanda o fluxo de autenticação')
    expect(text).toContain('"id":"tab"')
    expect(text).toContain('JÁ ESTÁ desenhado na tela')
  })

  it('o pedido de correção leva o erro e o teto', () => {
    expect(buildRepairPrompt('o JSON não segue o formato', 1)).toContain('o JSON não segue o formato')
    expect(buildRepairPrompt('x', 1)).toContain('no máximo 5 nós')
    expect(buildRepairPrompt('x', 2)).toContain('no máximo 8 nós')
    expect(buildRepairPrompt('x', 1)).toContain('Reescreva o diagrama COMPLETO')
  })

  it('no ajuste, o pedido de correção segue o contrato do primeiro turno: só as diferenças sobre o grafo anterior', () => {
    const text = buildRepairPrompt('x', 3, true)
    expect(text).toContain('só as DIFERENÇAS')
    expect(text).toContain('`remove`')
    expect(text).not.toContain('Reescreva o diagrama COMPLETO')
  })

  it('a diretiva de cada nível traz os tetos novos (diagrama de ideias)', () => {
    expect(depthDirective(2)).toContain('No máximo 8 nós e 10 arestas')
    expect(depthDirective(3)).toContain('No máximo 12 nós')
    for (const depth of [1, 2, 3, 4, 5] as const) expect(depthDirective(depth)).not.toMatch(/arquivo|rota|campo/i)
  })

  it('a correção por texto de código lista os rótulos e, no ajuste, pede só as diferenças', () => {
    const full = buildIdeaRepairPrompt(['useArchitectTab', 'POST /api/x'], 3)
    expect(full).toContain('- useArchitectTab')
    expect(full).toContain('- POST /api/x')
    expect(full).toContain('PROIBIDO em qualquer texto')
    expect(full).toContain('Reescreva o diagrama COMPLETO de novo como ideias')
    const adjust = buildIdeaRepairPrompt(['useArchitectTab'], 3, true)
    expect(adjust).toContain('só as DIFERENÇAS')
    expect(adjust).not.toContain('Reescreva o diagrama COMPLETO')
  })
})
