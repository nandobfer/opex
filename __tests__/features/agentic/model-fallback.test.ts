import { describe, expect, it, vi } from 'vitest'
import { fallbackNotice, fallbackResumeText, limitStopMessage, runWithFallback } from '@/features/agentic/server/model-fallback'
import type { TurnResult } from '@/lib/ai/opencode-run'

const ok = (text = 'ok'): TurnResult => ({ outcome: 'succeeded', text, message: null, costUsd: 0.1, durationMs: 10 })
const modelFail = (message = 'limite de uso'): TurnResult => ({ outcome: 'failed', text: '', message, costUsd: 0.05, durationMs: 5, failure: 'model' })
const agent = { agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [{ model: 'openai/gpt-5', variant: 'high' }, { model: 'deepseek/v3', variant: null }] }
const signal = () => new AbortController().signal
const LIMIT = 'Limite de uso do provedor em anthropic/opus (provider.rate-limit: rate limit)'
const limited = (): TurnResult => ({ ...modelFail(LIMIT), limited: true })

describe('runWithFallback', () => {
  it('sucesso no principal: um único turno, sem troca', async () => {
    const run = vi.fn(async () => ok())
    const onSwitch = vi.fn()
    const result = await runWithFallback(agent, 'faça X', run, { signal: signal(), onSwitch })
    expect(result.outcome).toBe('succeeded')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ agent: 'plan', model: 'anthropic/opus', variant: null }, 'faça X')
    expect(onSwitch).not.toHaveBeenCalled()
  })

  it('modelo falhou: retoma com o próximo da lista (mesmo agente), avisa e soma o custo', async () => {
    const run = vi.fn().mockResolvedValueOnce(modelFail()).mockResolvedValueOnce(ok('# Plano'))
    const onSwitch = vi.fn()
    const result = await runWithFallback(agent, 'faça X', run, { signal: signal(), onSwitch })
    expect(result).toMatchObject({ outcome: 'succeeded', text: '# Plano', costUsd: 0.15000000000000002, durationMs: 15 })
    expect(run.mock.calls[1]).toEqual([{ agent: 'plan', model: 'openai/gpt-5', variant: 'high' }, fallbackResumeText('limite de uso', 'faça X')])
    expect(onSwitch).toHaveBeenCalledWith(expect.objectContaining({ index: 1, total: 2, reason: 'limite de uso' }))
    expect(fallbackNotice(onSwitch.mock.calls[0]![0])).toBe('anthropic/opus falhou (limite de uso): continuando com openai/gpt-5 (high) — fallback 1 de 2.')
  })

  it('todos falham: devolve a falha do último modelo', async () => {
    const run = vi.fn().mockResolvedValueOnce(modelFail('cota')).mockResolvedValueOnce(modelFail('sobrecarga')).mockResolvedValueOnce(modelFail('indisponível'))
    const result = await runWithFallback(agent, 'x', run, { signal: signal() })
    expect(run).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ outcome: 'failed', message: 'indisponível' })
    // O texto da retomada parte sempre da mensagem original da etapa.
    expect(run.mock.calls[2]![1]).toBe(fallbackResumeText('sobrecarga', 'x'))
  })

  it.each([
    ['Parar (interrompido)', { outcome: 'interrupted', text: '', message: 'Interrompido', costUsd: 0, durationMs: 1 } as TurnResult],
    ['conexão perdida', { outcome: 'failed', text: '', message: 'Conexão com o OpenCode perdida', costUsd: 0, durationMs: 1, failure: 'other' } as TurnResult],
  ])('%s não troca de modelo', async (_label, failure) => {
    const run = vi.fn(async () => failure)
    expect(await runWithFallback(agent, 'x', run, { signal: signal() })).toMatchObject({ outcome: failure.outcome, message: failure.message })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('reconexão acompanha a execução existente sem fallback', async () => {
    const run = vi.fn(async () => modelFail())
    await runWithFallback(agent, 'x', run, { signal: signal(), attach: true })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('interrompido durante a falha: não segue para o próximo', async () => {
    const controller = new AbortController()
    const run = vi.fn(async () => {
      controller.abort()
      return modelFail()
    })
    await runWithFallback(agent, 'x', run, { signal: controller.signal })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('sem fallbacks: comportamento de hoje (um turno)', async () => {
    const run = vi.fn(async () => modelFail())
    const result = await runWithFallback({ agent: 'plan', model: null, variant: null }, 'x', run, { signal: signal() })
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.outcome).toBe('failed')
  })

  it('texto de retomada customizado (fork)', async () => {
    const run = vi.fn().mockResolvedValueOnce(modelFail('cota')).mockResolvedValueOnce(ok())
    await runWithFallback(agent, 'pergunta', run, { signal: signal(), resumeText: (reason, text) => `R(${reason}) ${text}` })
    expect(run.mock.calls[1]![1]).toBe('R(cota) pergunta')
  })

  it('cota da Anthropic (limited): troca para o fallback, registrando modelo original, de fallback e o motivo', async () => {
    const run = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(ok('# Plano'))
    const onSwitch = vi.fn()
    const result = await runWithFallback(agent, 'faça X', run, { signal: signal(), onSwitch })
    expect(result).toMatchObject({ outcome: 'succeeded', text: '# Plano' })
    expect(run.mock.calls[1]).toEqual([{ agent: 'plan', model: 'openai/gpt-5', variant: 'high' }, fallbackResumeText(LIMIT, 'faça X')])
    const change = onSwitch.mock.calls[0]![0]
    expect(change).toMatchObject({ from: { model: 'anthropic/opus' }, to: { model: 'openai/gpt-5' }, reason: LIMIT })
    expect(fallbackNotice(change)).toContain('anthropic/opus falhou (Limite de uso do provedor')
  })

  it('cota esgotada sem fallback: para com o motivo claro, em vez de esperar', async () => {
    const run = vi.fn(async () => limited())
    const result = await runWithFallback({ agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [] }, 'x', run, { signal: signal() })
    expect(run).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ outcome: 'failed', failure: 'model', limited: true, message: `${LIMIT}. Nenhum modelo de fallback configurado para esta etapa.` })
  })

  it('cota esgotada também no último fallback: avisa que a corrente acabou', async () => {
    const run = vi.fn(async () => limited())
    const result = await runWithFallback(agent, 'x', run, { signal: signal() })
    expect(run).toHaveBeenCalledTimes(3)
    expect(result.message).toBe(limitStopMessage(LIMIT, 3))
    expect(result.message).toContain('Todos os modelos de fallback também falharam')
  })

  it('falha de modelo sem limite mantém a mensagem original', async () => {
    const run = vi.fn(async () => modelFail('modelo indisponível'))
    const result = await runWithFallback({ agent: 'plan', model: 'a/b', variant: null }, 'x', run, { signal: signal() })
    expect(result.message).toBe('modelo indisponível')
  })
})
