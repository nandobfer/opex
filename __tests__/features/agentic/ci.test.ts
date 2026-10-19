import { describe, expect, it } from 'vitest'
import { ciFailureState, ciFixDecision, ciFixKey, describeCiState, type CiFailure } from '@/features/agentic/ci'

const run = (id: number, name: string, conclusion: string | null, status = 'completed') => ({ id, name, status, conclusion, details_url: `https://github.com/org/app/actions/runs/9${id}/job/8${id}` })

describe('ciFailureState', () => {
  it('sem verificações: none', () => {
    expect(ciFailureState([], [])).toMatchObject({ state: 'none', failures: [] })
  })

  it('espera todas as verificações terminarem (check em andamento ou status pendente)', () => {
    expect(ciFailureState([run(1, 'test', 'failure'), run(2, 'lint', null, 'in_progress')]).state).toBe('pending')
    expect(ciFailureState([run(1, 'test', 'failure')], [{ id: 5, context: 'ci/legacy', state: 'pending' }])).toMatchObject({ state: 'pending', pending: 1, total: 2 })
  })

  it('falha = failure, timed_out, startup_failure, action_required e status failure/error', () => {
    const result = ciFailureState(
      [run(1, 'a', 'failure'), run(2, 'b', 'timed_out'), run(3, 'c', 'startup_failure'), run(4, 'd', 'action_required'), run(5, 'e', 'success')],
      [{ id: 6, context: 'f', state: 'failure' }, { id: 7, context: 'g', state: 'error' }, { id: 8, context: 'h', state: 'success' }],
    )
    expect(result.state).toBe('failed')
    expect(result.failures.map((failure) => failure.name)).toEqual(['a', 'b', 'c', 'd', 'f', 'g'])
    expect(result.failures[0]).toMatchObject({ id: 'check:1', runId: 91, jobId: 81 })
  })

  it('cancelled e skipped não contam como falha', () => {
    expect(ciFailureState([run(1, 'a', 'cancelled'), run(2, 'b', 'skipped'), run(3, 'c', 'success')]).state).toBe('passed')
  })

  it('considera só a última execução de cada verificação (reexecução que passou)', () => {
    expect(ciFailureState([run(1, 'test', 'failure'), run(9, 'test', 'success')]).state).toBe('passed')
    expect(ciFailureState([run(9, 'test', 'failure'), run(1, 'test', 'success')]).failures[0]!.id).toBe('check:9')
  })
})

describe('ciFixDecision', () => {
  const failures: CiFailure[] = [{ id: 'check:2', name: 'b', url: null, runId: null, jobId: null, summary: null }, { id: 'check:1', name: 'a', url: null, runId: null, jobId: null, summary: null }]
  const on = { fixCi: true, ciFixLimit: null }

  it('chave estável (sha:ids ordenados)', () => {
    expect(ciFixKey('h1', failures)).toBe('h1:check:1,check:2')
  })

  it('1ª tentativa do commit pode reexecutar; a seguinte no mesmo commit não', () => {
    expect(ciFixDecision({}, on, 'h1', failures)).toEqual({ action: 'fix', key: 'h1:check:1,check:2', rerunAllowed: true, attempt: 1 })
    expect(ciFixDecision({ ciFixHeadSha: 'h1', ciFixKey: 'h1:check:0', ciFixAttempts: 1 }, on, 'h1', failures)).toMatchObject({ action: 'fix', rerunAllowed: false, attempt: 2 })
  })

  it('mesmas falhas já tratadas ou correção desligada: nada a fazer', () => {
    expect(ciFixDecision({ ciFixKey: 'h1:check:1,check:2' }, on, 'h1', failures)).toEqual({ action: 'skip', reason: 'handled' })
    expect(ciFixDecision({}, { fixCi: false, ciFixLimit: null }, 'h1', failures)).toEqual({ action: 'skip', reason: 'disabled' })
  })

  it('limite opcional: avisa uma vez; sem limite (null) nunca para', () => {
    expect(ciFixDecision({ ciFixAttempts: 3 }, { fixCi: true, ciFixLimit: 3 }, 'h2', failures)).toEqual({ action: 'limit', notify: true })
    expect(ciFixDecision({ ciFixAttempts: 3, ciFixLimitNotified: true }, { fixCi: true, ciFixLimit: 3 }, 'h2', failures)).toEqual({ action: 'limit', notify: false })
    expect(ciFixDecision({ ciFixAttempts: 50 }, on, 'h2', failures).action).toBe('fix')
  })
})

describe('describeCiState', () => {
  it('texto do passo CI na verificação do PR', () => {
    expect(describeCiState(ciFailureState([run(1, 'test', 'failure')]), 'abcdef123')).toEqual({ text: 'CI falhou no commit abcdef1: test', level: 'warn' })
    expect(describeCiState(ciFailureState([run(1, 'test', 'success')])).level).toBe('success')
    expect(describeCiState(ciFailureState([run(1, 'test', null, 'queued')])).text).toContain('aguardando todas terminarem')
    expect(describeCiState(ciFailureState([])).text).toBe('CI: nenhuma verificação')
  })
})
