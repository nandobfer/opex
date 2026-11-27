import { describe, expect, it } from 'vitest'
import { isKeyFailureStatus, keyFailuresMessage, rotateFrom } from "@nandobfer/integracoes/modules/integrations/ia/ai/key-rotation"

/** Rodízio das chaves em uso (OPE-179): ordem circular, falhas da chave e mensagem quando todas falham. */

describe('rodízio das chaves de API', () => {
  it('começa na posição do cursor e dá a volta', () => {
    expect(rotateFrom(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
    expect(rotateFrom(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a'])
    expect(rotateFrom(['a', 'b', 'c'], 5)).toEqual(['c', 'a', 'b'])
    expect(rotateFrom(['a'], 7)).toEqual(['a'])
    expect(rotateFrom([], 3)).toEqual([])
  })

  it('só recusa, saldo e limite contam como falha da chave; 400 e 5xx não', () => {
    expect([401, 402, 403, 429].every(isKeyFailureStatus)).toBe(true)
    expect([200, 400, 404, 500, 503].some(isKeyFailureStatus)).toBe(false)
  })

  it('a mensagem diz quais chaves falharam e por quê', () => {
    expect(keyFailuresMessage('Gemini', [{ name: 'Pessoal', status: 401 }, { name: 'Trabalho', status: 429 }])).toBe(
      'Todas as chaves em uso do Gemini falharam: “Pessoal” (HTTP 401, chave recusada), “Trabalho” (HTTP 429, limite ou cota).',
    )
    expect(keyFailuresMessage('JEV', [{ name: 'A', status: 402 }])).toContain('sem saldo ou cota')
  })
})
