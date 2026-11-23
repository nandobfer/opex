import { describe, expect, it } from 'vitest'

/**
 * Modelos de fallback (OPE-181): a mesma lista e a mesma validação em todas as configurações de
 * turno do OpenCode — até 5, sem repetir o modelo principal e sem repetidos, ordem preservada.
 */

import { fallbackConflict, MAX_MODEL_FALLBACKS, normalizeFallbacks } from '@/features/ai/model-fallbacks'
import { agentConfigSchema } from '@/features/agentic/schemas'
import { DEFAULT_TASK_REFINEMENT_SETTINGS, taskRefinementSettingsSchema } from '@/features/ai/schemas'
import { DEFAULT_PR_REVIEW_SETTINGS, prReviewSettingsSchema } from '@/features/pr-review/schemas'
import { DEFAULT_MADDOX_AGENT_SETTINGS, maddoxAgentSettingsSchema } from '@/features/maddox-agent/schemas'
import { EMPTY_ROUTINE_LIMITS, routineAgentInputSchema, withRoutineEngineDefaults } from '@/features/routine-agents/schemas'

const PRIMARY = 'anthropic/claude'
const flash = { model: 'deepseek/flash', variant: null }
const gpt = { model: 'openai/gpt', variant: 'high' }

const routine = (fallbacks: unknown) => ({
  name: '',
  objective: 'Vigiar vagas',
  instructions: '',
  engine: 'opencode',
  opex: { provider: null, model: '', variant: null, enabledTools: [], enabledMcpServers: [], enabledSkills: [] },
  opencode: { model: PRIMARY, variant: null, agent: null, fallbacks, enabledMcps: [], enabledSkills: [] },
  confirmIrreversible: true,
  limits: EMPTY_ROUTINE_LIMITS,
  triggers: [],
})

/** Cada configuração com a lista no seu lugar, e o caminho do campo esperado no erro. */
const cases: { name: string; parse: (fallbacks: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }; path: (string | number)[] }[] = [
  { name: 'papel da mesa (agentConfigSchema)', parse: (fallbacks) => agentConfigSchema.safeParse({ agent: null, model: PRIMARY, variant: null, fallbacks }), path: ['fallbacks'] },
  { name: 'Agente Revisor', parse: (fallbacks) => prReviewSettingsSchema.safeParse({ ...DEFAULT_PR_REVIEW_SETTINGS, model: PRIMARY, fallbacks }), path: ['fallbacks'] },
  { name: 'Agente Refinador', parse: (fallbacks) => taskRefinementSettingsSchema.safeParse({ ...DEFAULT_TASK_REFINEMENT_SETTINGS, model: PRIMARY, fallbacks }), path: ['fallbacks'] },
  { name: 'Agente Maddox (modelo padrão)', parse: (fallbacks) => maddoxAgentSettingsSchema.safeParse({ ...DEFAULT_MADDOX_AGENT_SETTINGS, main: { model: PRIMARY, variant: null, fallbacks } }), path: ['main', 'fallbacks'] },
  { name: 'agente rotineiro (motor OpenCode)', parse: (fallbacks) => routineAgentInputSchema.safeParse(routine(fallbacks)), path: ['opencode', 'fallbacks'] },
]

describe('lista de modelos de fallback nas configurações', () => {
  it.each(cases)('$name: lista válida é aceita', ({ parse }) => {
    expect(parse([flash, gpt]).success).toBe(true)
  })

  it.each(cases)('$name: igual ao principal, repetido e acima do limite são recusados', ({ parse, path }) => {
    const primary = parse([{ model: PRIMARY, variant: null }])
    expect(primary.success).toBe(false)
    expect(primary.error!.issues).toContainEqual(expect.objectContaining({ path: [...path, 0, 'model'], message: 'O fallback é igual ao modelo principal' }))

    const duplicate = parse([flash, gpt, flash])
    expect(duplicate.success).toBe(false)
    expect(duplicate.error!.issues).toContainEqual(expect.objectContaining({ path: [...path, 2, 'model'], message: 'Modelo de fallback repetido' }))

    const many = Array.from({ length: MAX_MODEL_FALLBACKS + 1 }, (_, index) => ({ model: `p/m${index}`, variant: null }))
    expect(parse(many).success).toBe(false)
  })

  it('mesmo modelo com outra variante não conta como repetido nem igual ao principal', () => {
    expect(fallbackConflict([{ model: PRIMARY, variant: 'high' }], 0, { model: PRIMARY, variant: null })).toBeNull()
    expect(fallbackConflict([gpt, { model: 'openai/gpt', variant: null }], 1, { model: PRIMARY, variant: null })).toBeNull()
  })

  it('configurações antigas (sem a lista) seguem válidas e carregam sem fallback', () => {
    expect(maddoxAgentSettingsSchema.safeParse({ ...DEFAULT_MADDOX_AGENT_SETTINGS, main: { model: PRIMARY, variant: null } }).success).toBe(true)
    const legacy = routine(undefined)
    delete (legacy.opencode as { fallbacks?: unknown }).fallbacks
    expect(routineAgentInputSchema.safeParse(legacy).success).toBe(true)
    expect(withRoutineEngineDefaults({ opencode: { model: PRIMARY } }).opencode.fallbacks).toEqual([])
    expect(normalizeFallbacks(undefined)).toEqual([])
    expect(normalizeFallbacks([{ model: 'a/b', variant: '' }])).toEqual([{ model: 'a/b', variant: null }])
  })
})
