import { describe, expect, it } from 'vitest'
import { integrationSource } from '@nandobfer/integracoes'
import { OPEX_INTEGRATIONS } from '@/features/integrations/registry/definitions'

/**
 * Origem do adaptador no registro do Opex (OPE-212): o badge da lista mostra "Próprio" para as integrações que
 * existem só no Opex e "Biblioteca" para as publicadas na `@nandobfer/integracoes` (inclusive as estendidas aqui).
 */

const OWN = ['orcamentos', 'builder_machine', 'engramind', 'evolution-api', 'gotenberg', 'google_drive']

describe('origem das integrações do Opex', () => {
  it('as integrações próprias do Opex saem como "app" (Próprio)', () => {
    for (const id of OWN) {
      const def = OPEX_INTEGRATIONS.find((item) => item.id === id)
      expect(def, id).toBeDefined()
      expect([id, integrationSource(def!)]).toEqual([id, 'app'])
    }
  })

  it('todas as demais vêm da biblioteca, inclusive as estendidas pelo Opex (GitHub, Crons)', () => {
    const library = OPEX_INTEGRATIONS.filter((def) => !OWN.includes(def.id))
    expect(library.map((def) => def.id)).toEqual(expect.arrayContaining(['pusher', 'internal_api', 'crons', 'github', 'ai', 'ai_gemini', 'smtp', 'storage_s3', 'fx_ptax', 'models_dev']))
    for (const def of library) expect([def.id, integrationSource(def)]).toEqual([def.id, 'library'])
  })

  it('nenhuma definição do Opex declara ambiente nem variáveis de debug', () => {
    for (const def of OPEX_INTEGRATIONS) {
      expect(def).not.toHaveProperty('defaultEnvironment')
      expect(def).not.toHaveProperty('debugEnv')
    }
  })
})
