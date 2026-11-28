import { describe, expect, it } from 'vitest'
import { completeLines, diffSteps, emptyStepsSeen, failureExcerpt, formatJobLog, parseGithubRunUrl, type GithubJob } from '@/features/agentic/github-run-log'

/**
 * Saída do GitHub Actions no log do build (OPE-214): o servidor transforma o run (etapas e logs dos
 * jobs) em linhas do terminal da aba Build, sem repetir nada entre consultas.
 */

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '')

describe('parseGithubRunUrl', () => {
  it('lê o run da linha que o script da prévia imprime (caso OPE-213)', () => {
    expect(parseGithubRunUrl('remote:\nPrévia GitHub: https://github.com/nandobfer/opex/actions/runs/46092133916\n')).toEqual({ repo: 'nandobfer/opex', runId: 46092133916 })
  })

  it('vale a última URL do trecho; sem URL de run devolve null', () => {
    expect(parseGithubRunUrl('https://github.com/a/b/actions/runs/1 e https://github.com/a/b/actions/runs/2')).toEqual({ repo: 'a/b', runId: 2 })
    expect(parseGithubRunUrl('https://github.com/nandobfer/opex/pull/new/feat/x')).toBeNull()
  })
})

describe('formatJobLog', () => {
  it('tira o carimbo de hora e converte os comandos do runner', () => {
    const raw = ['2026-11-27T22:15:01.1234567Z ##[group]Run pnpm test', '2026-11-27T22:15:02.0000000Z ok 1', '2026-11-27T22:15:03.0000000Z ##[endgroup]', '2026-11-27T22:15:04.0000000Z ##[error]Process completed with exit code 1.', ''].join('\r\n')
    const out = formatJobLog(raw)
    expect(strip(out)).toBe('▸ Run pnpm test\nok 1\nProcess completed with exit code 1.\n')
    expect(out).toContain('\x1b[31mProcess completed')
    expect(out).not.toContain('2026-11-27T')
  })

  it('completeLines guarda só as linhas completas (o resto chega na próxima leitura)', () => {
    expect(completeLines('a\nb\nmeio')).toBe('a\nb\n')
    expect(completeLines('sem quebra')).toBe('')
  })
})

describe('diffSteps', () => {
  const job = (steps: GithubJob['steps'], status = 'in_progress'): GithubJob => ({ id: 7, name: 'preview', status, conclusion: null, steps })

  it('escreve cabeçalho, início e fim de cada etapa uma única vez entre consultas', () => {
    const seen = emptyStepsSeen()
    const first = diffSteps(seen, [job([{ name: 'Checkout', number: 1, status: 'in_progress', conclusion: null }, { name: 'Testes', number: 2, status: 'queued', conclusion: null }])])
    expect(strip(first)).toContain('● Job preview')
    expect(strip(first)).toContain('▶ Etapa 1/2 · Checkout')
    expect(strip(first)).not.toContain('Testes')
    const second = diffSteps(seen, [
      job([
        { name: 'Checkout', number: 1, status: 'completed', conclusion: 'success', started_at: '2026-11-27T22:15:00Z', completed_at: '2026-11-27T22:15:42Z' },
        { name: 'Testes', number: 2, status: 'in_progress', conclusion: null },
      ]),
    ])
    expect(strip(second)).toBe('  ✔ Checkout 42 s\n▶ Etapa 2/2 · Testes\n')
    expect(diffSteps(seen, [job([{ name: 'Checkout', number: 1, status: 'completed', conclusion: 'success' }, { name: 'Testes', number: 2, status: 'in_progress', conclusion: null }])])).toBe('')
  })

  it('job na fila ainda não aparece; etapa pulada sai só como pulada', () => {
    const seen = emptyStepsSeen()
    expect(diffSteps(seen, [job([], 'queued')])).toBe('')
    const out = strip(diffSteps(seen, [job([{ name: 'Deploy', number: 1, status: 'completed', conclusion: 'skipped' }], 'completed')]))
    expect(out).toContain('⊘ Deploy (pulada)')
    expect(out).not.toContain('▶ Etapa')
  })
})

describe('failureExcerpt', () => {
  it('aponta o job e a etapa que falharam, com as linhas de erro e o final do log', () => {
    const jobs: GithubJob[] = [
      { id: 1, name: 'preview', status: 'completed', conclusion: 'failure', steps: [{ name: 'Checkout', number: 1, status: 'completed', conclusion: 'success' }, { name: 'Testes completos (antes do build)', number: 2, status: 'completed', conclusion: 'failure' }] },
    ]
    const logs = new Map([[1, '2026-11-27T22:15:01Z FAIL __tests__/x.test.ts > soma\n2026-11-27T22:15:02Z ##[error]Process completed with exit code 1.\n']])
    const text = failureExcerpt(jobs, logs)!
    expect(text).toContain('Job "preview" (failure), etapa 2 "Testes completos (antes do build)"')
    expect(text).toContain('Erros:\nProcess completed with exit code 1.')
    expect(text).toContain('FAIL __tests__/x.test.ts > soma')
  })

  it('run sem job com falha devolve null; job sem log avisa que o log não está disponível', () => {
    expect(failureExcerpt([{ id: 1, name: 'p', status: 'completed', conclusion: 'success' }], new Map())).toBeNull()
    expect(failureExcerpt([{ id: 1, name: 'p', status: 'completed', conclusion: 'cancelled' }], new Map())).toContain('(log do job indisponível)')
  })
})
