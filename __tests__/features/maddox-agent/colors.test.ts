import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/ai/server/settings', () => ({ assertCatalog: vi.fn(), availability: vi.fn(), loadFeature: vi.fn(), persistFeature: vi.fn() }))

import { z } from 'zod'
import { agentColorStyle } from '@/features/maddox-agent/colors'
import { DEFAULT_MADDOX_AGENT_SETTINGS, maddoxAgentSettingsSchema } from '@/features/maddox-agent/schemas'
import { withMaddoxDefaults } from '@/features/maddox-agent/server/settings'
import { HEX_COLOR_MESSAGE } from '@/lib/colors'

/** Cor do Agente Maddox: variáveis do contêiner (`agentColorStyle`) e o campo `color` da configuração. */

const savedSchema = z.preprocess(withMaddoxDefaults, maddoxAgentSettingsSchema)
const legacy: Record<string, unknown> = { ...DEFAULT_MADDOX_AGENT_SETTINGS }
delete legacy.color

describe('agentColorStyle', () => {
  it('com cor: --primary e --ring no triplet HSL e texto escuro sobre cor clara', () => {
    expect(agentColorStyle('#FBBF24')).toEqual({ '--primary': '43 96% 56%', '--primary-foreground': '240 10% 4%', '--ring': '43 96% 56%' })
  })

  it('com cor escura: texto claro', () => {
    expect(agentColorStyle('#8000FF')).toEqual({ '--primary': '270 100% 50%', '--primary-foreground': '0 0% 100%', '--ring': '270 100% 50%' })
  })

  it('sem cor: aplica a primária original explicitamente (não herda a de outro agente)', () => {
    const expected = { '--primary': 'var(--agent-primary)', '--primary-foreground': 'var(--agent-primary-foreground)', '--ring': 'var(--agent-ring)' }
    expect(agentColorStyle(null)).toEqual(expected)
    expect(agentColorStyle(undefined)).toEqual(expected)
  })
})

describe('campo color da configuração', () => {
  it('configuração salva antes do campo vira primária (null)', () => {
    expect(savedSchema.parse(legacy).color).toBeNull()
  })

  it('cor salva é normalizada (minúsculas e nome antigo da paleta)', () => {
    expect(savedSchema.parse({ ...legacy, color: '#a78bfa' }).color).toBe('#A78BFA')
    expect(savedSchema.parse({ ...legacy, color: 'sky' }).color).toBe('#38BDF8')
  })

  it('hex inválido é recusado na API com mensagem em pt-BR', () => {
    const result = maddoxAgentSettingsSchema.safeParse({ ...DEFAULT_MADDOX_AGENT_SETTINGS, color: 'roxo' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ path: ['color'], message: HEX_COLOR_MESSAGE })
  })

  it('aceita e devolve a cor em maiúsculas', () => {
    expect(maddoxAgentSettingsSchema.parse({ ...DEFAULT_MADDOX_AGENT_SETTINGS, color: '#22d3ee' }).color).toBe('#22D3EE')
  })
})
