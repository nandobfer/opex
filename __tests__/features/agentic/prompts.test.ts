import { describe, expect, it } from 'vitest'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import {
  branchNameFor,
  buildPrompt,
  cleanupPrompt,
  composeProjectFor,
  extractJsonBlock,
  extractPrUrl,
  formatReviewFeedback,
  implementPrompt,
  prPrompt,
  slugify,
  worktreePathFor,
  type WorkbenchContext,
} from '@/features/agentic/prompts'

const config = defaultCentralConfig('/home/u/app')
const ctx: WorkbenchContext = {
  code: 'GO-DEV-12',
  title: 'Exportar relatório',
  productName: 'Portal',
  repo: 'org/app',
  sessionDirectory: '/home/u/app',
  worktreePath: '/home/u/app-worktrees/go-dev-12',
  branch: 'feat/go-dev-12-exportar-relatorio',
  composeProject: 'portal-go-dev-12',
}

describe('nomes derivados da tarefa', () => {
  it('slugify remove acentos e símbolos', () => {
    expect(slugify('Relatório de Ações (v2)!')).toBe('relatorio-de-acoes-v2')
  })

  it('branch, worktree e projeto do compose seguem a central', () => {
    expect(branchNameFor(config, { code: 'GO-DEV-12', title: 'Exportar relatório' })).toBe('feat/go-dev-12-exportar-relatorio')
    expect(worktreePathFor(config, 'GO-DEV-12')).toBe('/home/u/app-worktrees/go-dev-12')
    expect(worktreePathFor({ ...config, worktreeRoot: '/wt' }, 'GO-DEV-12')).toBe('/wt/go-dev-12')
    expect(composeProjectFor('Portal Sipal', 'GO-DEV-12')).toBe('portal-sipal-go-dev-12')
  })
})

describe('mensagens das etapas', () => {
  it('implementação manda criar o worktree e mover a sessão', () => {
    const text = implementPrompt(config, ctx, 2)
    expect(text).toContain('git worktree add -b feat/go-dev-12-exportar-relatorio /home/u/app-worktrees/go-dev-12 origin/main')
    expect(text).toContain('session_move')
    expect(text).toContain('versão 2')
  })

  it('build usa a variável e a porta reservada', () => {
    const text = buildPrompt({ ...config, environment: { ...config.environment, portEnvVar: 'APP_PORT', composeFile: 'docker/compose.yml' } }, ctx, 4015)
    expect(text).toContain('APP_PORT=4015 docker compose -p portal-go-dev-12 -f docker/compose.yml up -d --build')
    expect(text).toContain('4001–4098')
  })

  it('PR novo usa gh pr create; PR existente só atualiza', () => {
    const task = { code: 'GO-DEV-12', title: 'Exportar', url: 'https://go/t' }
    expect(prPrompt({ ...config, git: { ...config.git, prDraft: true, prReviewers: ['ana'] } }, ctx, task, null)).toContain('gh pr create --base main --head feat/go-dev-12-exportar-relatorio --title "Exportar (GO-DEV-12)" --draft --reviewer ana')
    const update = prPrompt(config, ctx, task, { number: 7, url: 'https://github.com/org/app/pull/7' })
    expect(update).toContain('PR #7')
    expect(update).not.toContain('gh pr create')
  })

  it('limpeza respeita as opções da central', () => {
    const text = cleanupPrompt({ ...config, cleanup: { teardownEnvironment: true, removeWorktree: false, deleteBranch: false } }, ctx)
    expect(text).toContain('docker compose -p portal-go-dev-12 down')
    expect(text).not.toContain('git worktree remove')
    expect(text).not.toContain('git branch -D')
  })

  it('instruções adicionais da central vão no fim', () => {
    expect(implementPrompt({ ...config, instructions: { ...config.instructions, implementation: 'Use pnpm.' } }, ctx, 1)).toContain('## Instruções adicionais da central\nUse pnpm.')
  })
})

describe('leitura das respostas', () => {
  it('extractJsonBlock pega o último bloco json', () => {
    expect(extractJsonBlock('feito\n```json\n{"ok": false}\n```\nmais\n```json\n{"ok": true}\n```')).toEqual({ ok: true })
    expect(extractJsonBlock('resultado: {"url": "https://x"}')).toEqual({ url: 'https://x' })
    expect(extractJsonBlock('sem json')).toBeNull()
  })

  it('extractPrUrl pega o último PR citado', () => {
    expect(extractPrUrl('abri https://github.com/org/app/pull/3 e https://github.com/org/app/pull/4')).toEqual({ url: 'https://github.com/org/app/pull/4', number: 4 })
    expect(extractPrUrl('nada')).toBeNull()
  })

  it('formatReviewFeedback junta corpo e comentários; sem texto vira vazio', () => {
    const text = formatReviewFeedback([{ author: 'ana', body: 'Ajustar nomes', comments: [{ path: 'a.ts', line: 3, body: 'renomear' }] }])
    expect(text).toContain('### @ana')
    expect(text).toContain('`a.ts:3`: renomear')
    expect(formatReviewFeedback([{ author: 'ana', body: '  ', comments: [] }])).toBe('')
  })
})
