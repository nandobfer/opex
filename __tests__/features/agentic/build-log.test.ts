import { describe, expect, it } from 'vitest'
import {
  applyBuildLogLine,
  BUILD_LOG_TRUNCATED,
  buildExitLine,
  buildFixSeparator,
  capBuildLog,
  INITIAL_BUILD_LOG_VIEW,
  splitBuildLogChunk,
  terminalBuildFailure,
} from '@/features/agentic/build-log'

/** Log de build da prévia (aba "Build (N)"): regras puras do log e da exibição. */

describe('linhas do app no log', () => {
  it('código de saída: verde no sucesso, vermelho na falha ou quando o comando não terminou', () => {
    expect(buildExitLine(0)).toContain('\x1b[32m✔ exit 0')
    expect(buildExitLine(1)).toContain('\x1b[31m✖ exit 1')
    expect(buildExitLine(null)).toContain('o comando não terminou')
  })

  it('tempo esgotado e processo morto pelo sistema não vão para a correção do agente', () => {
    expect(terminalBuildFailure(124, 30)).toBe('O build da prévia excedeu o tempo limite (30 min)')
    expect(terminalBuildFailure(137, 30)).toContain('exit 137')
    expect(terminalBuildFailure(143, 30)).toContain('exit 143')
    expect(terminalBuildFailure(1, 30)).toBeNull()
    expect(terminalBuildFailure(17, 30)).toBeNull()
  })

  it('separador da correção do agente traz o número da correção', () => {
    expect(buildFixSeparator(3)).toContain('agente corrigindo o código (correção 3)')
  })
})

describe('capBuildLog', () => {
  it('acima do teto mantém o final e soma o descartado', () => {
    expect(capBuildLog('abcdef', 0, 4)).toEqual({ log: 'cdef', dropped: 2 })
    expect(capBuildLog('abc', 5, 4)).toEqual({ log: 'abc', dropped: 5 })
  })
})

describe('applyBuildLogLine', () => {
  it('snapshot reinicia o terminal; append na posição certa anexa', () => {
    let step = applyBuildLogLine(INITIAL_BUILD_LOG_VIEW, { type: 'snapshot', offset: 0, text: 'abc', status: 'running', message: null })
    expect(step.reset).toBe('abc')
    expect(step.state).toMatchObject({ loaded: true, end: 3, status: 'running' })
    step = applyBuildLogLine(step.state, { type: 'append', offset: 3, text: 'de' })
    expect(step.write).toBe('de')
    expect(step.state.end).toBe(5)
  })

  it('append repetido não duplica; append adiante pede novo snapshot', () => {
    const state = { ...INITIAL_BUILD_LOG_VIEW, loaded: true, end: 5, status: 'running' as const }
    expect(applyBuildLogLine(state, { type: 'append', offset: 3, text: 'de' }).write).toBeUndefined()
    expect(applyBuildLogLine(state, { type: 'append', offset: 4, text: 'efg' }).write).toBe('fg')
    expect(applyBuildLogLine(state, { type: 'append', offset: 9, text: 'x' }).resync).toBe(true)
  })

  it('log com o início descartado avisa no terminal; status final atualiza o estado', () => {
    const step = applyBuildLogLine(INITIAL_BUILD_LOG_VIEW, { type: 'snapshot', offset: 10, text: 'fim', status: 'failed', message: 'erro' })
    expect(step.reset).toBe(`${BUILD_LOG_TRUNCATED}fim`)
    expect(step.state.end).toBe(13)
    expect(applyBuildLogLine(step.state, { type: 'status', status: 'succeeded', message: null }).state.status).toBe('succeeded')
  })

  it('splitBuildLogChunk separa as linhas completas do resto', () => {
    const { lines, rest } = splitBuildLogChunk('{"type":"ping","ts":"x"}\n{"type":"app')
    expect(lines).toEqual([{ type: 'ping', ts: 'x' }])
    expect(rest).toBe('{"type":"app')
  })
})
