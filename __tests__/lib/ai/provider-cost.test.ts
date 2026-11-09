import { describe, expect, it } from 'vitest'
import { addStepCost, createOpencodeGoCostScanner, findOpencodeGoCost, opencodeSessionStepCost, type AiStepCost } from '@/lib/ai/provider-cost'

/** OPE-154: custo efetivo do OpenCode Go = `cost` (Extra Usage, em dinheiro) + `opencode.allowance` (cota). */

const goUsage = { prompt_tokens: 35, completion_tokens: 34, cost: 0, opencode: { billing_source: 'go', list_cost: 0.00002565, allowance: 0.00001539 } }

describe('findOpencodeGoCost', () => {
  it('lê o bloco do Go em qualquer profundidade (Chat Completions, Messages, Responses, Gemini)', () => {
    const expected = { costUsd: 0.00001539, billing: { source: 'go', allowanceUsd: 0.00001539, listCostUsd: 0.00002565 } }
    expect(findOpencodeGoCost({ choices: [], usage: goUsage })).toEqual(expected)
    expect(findOpencodeGoCost({ type: 'response.completed', response: { usage: goUsage } })).toEqual(expected)
    expect(findOpencodeGoCost({ usageMetadata: goUsage })).toEqual(expected)
  })

  it('soma o cobrado em dinheiro (Extra Usage) com a cota', () => {
    expect(findOpencodeGoCost({ usage: { cost: 0.5, opencode: { billing_source: 'extra', allowance: 0.25 } } })?.costUsd).toBe(0.75)
  })

  it('sem o bloco do Go não há custo', () => {
    expect(findOpencodeGoCost({ usage: { prompt_tokens: 1, cost: 0.1 } })).toBeNull()
    expect(findOpencodeGoCost(null)).toBeNull()
  })
})

describe('createOpencodeGoCostScanner', () => {
  it('SSE: acha o custo no último chunk mesmo com a linha partida entre pedaços', () => {
    const found: AiStepCost[] = []
    const scanner = createOpencodeGoCostScanner((cost) => found.push(cost))
    const line = `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: goUsage })}\n\n`
    scanner.push('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n')
    scanner.push(line.slice(0, 40))
    scanner.push(line.slice(40))
    scanner.push('data: [DONE]\n\n')
    scanner.end()
    expect(found).toEqual([{ costUsd: 0.00001539, billing: { source: 'go', allowanceUsd: 0.00001539, listCostUsd: 0.00002565 } }])
  })

  it('JSON sem stream (com quebras de linha) é lido inteiro no fim', () => {
    const found: AiStepCost[] = []
    const scanner = createOpencodeGoCostScanner((cost) => found.push(cost))
    const body = JSON.stringify({ choices: [], usage: goUsage }, null, 2)
    scanner.push(body.slice(0, 30))
    scanner.push(body.slice(30))
    scanner.end()
    expect(found).toHaveLength(1)
  })

  it('corpo de erro ou sem custo não gera nada nem lança', () => {
    const found: AiStepCost[] = []
    const scanner = createOpencodeGoCostScanner((cost) => found.push(cost))
    scanner.push('{"error":{"type":"authentication_error","message":"Invalid credential"}}')
    scanner.end()
    expect(found).toEqual([])
  })
})

describe('addStepCost e opencodeSessionStepCost', () => {
  it('soma passos mantendo null quando nenhum lado informou', () => {
    const a = { costUsd: 1, billing: { source: 'go', allowanceUsd: 1, listCostUsd: 2 } }
    const b = { costUsd: 0.5, billing: { source: 'go', allowanceUsd: 0.5, listCostUsd: null } }
    expect(addStepCost(a, b)).toEqual({ costUsd: 1.5, billing: { source: 'go', allowanceUsd: 1.5, listCostUsd: 2 } })
    expect(addStepCost(null, b)).toBe(b)
    expect(addStepCost({ costUsd: null, billing: null }, { costUsd: null, billing: null })).toEqual({ costUsd: null, billing: null })
  })

  it('OpenCode de sessão: custo nos metadados do passo', () => {
    expect(opencodeSessionStepCost({ opencode: { cost: 0.0012 } })).toEqual({ costUsd: 0.0012, billing: null })
    expect(opencodeSessionStepCost({})).toBeNull()
  })
})
