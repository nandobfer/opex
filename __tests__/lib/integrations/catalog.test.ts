import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CRON_JOBS,
  HEALTH_CHECK_JOB_ID,
  IN_DEVELOPMENT_INTEGRATIONS,
  INTEGRATIONS,
  INTEGRATIONS_BASE_PATH,
  INTEGRATION_IDS,
  getInDevelopmentIntegration,
  getIntegrationDef,
  hasCustomIntegrationPath,
  integrationPath,
  isCardManagedField,
  isIntegrationId,
} from '@/lib/integrations/catalog'

describe('catálogo de integrações', () => {
  it('traz exatamente as integrações ativas', () => {
    const ids = ['pusher', 'internal_api', 'crons', 'github', 'ai', 'ai_opencode', 'ai_gemini', 'ai_jev', 'orcamentos']
    expect([...INTEGRATION_IDS]).toEqual(ids)
    expect(INTEGRATIONS.map((def) => def.id)).toEqual(ids)
    expect(isIntegrationId('pusher')).toBe(true)
    expect(isIntegrationId('whatsapp_orchestrator')).toBe(false)
  })

  it('Archflow aparece como Em desenvolvimento, sem definição configurável', () => {
    expect(IN_DEVELOPMENT_INTEGRATIONS.map((item) => [item.id, item.name])).toEqual([['archflow', 'Archflow']])
    for (const item of IN_DEVELOPMENT_INTEGRATIONS) {
      expect(getIntegrationDef(item.id)).toBeUndefined()
      expect(getInDevelopmentIntegration(item.id)).toBe(item)
      expect('viewKey' in item).toBe(false)
    }
  })

  it('páginas das integrações ficam em /integracoes', () => {
    expect(INTEGRATIONS_BASE_PATH).toBe('/integracoes')
    expect(integrationPath('crons')).toBe('/integracoes/crons')
  })

  it('API interna é interna, sem campos nem segredos e com documentação gerenciada', () => {
    const def = getIntegrationDef('internal_api')
    expect(def.name).toBe('API interna')
    expect(def.defaultEnvironment).toBe('interno')
    expect(def.publicFields).toEqual([])
    expect(def.secretFields).toEqual([])
    expect(def.managedSwaggerPath).toBe('/api/openapi.json')
    expect(def.explorer?.baseUrlField).toBe('internal')
  })

  it('o Pusher não retransmite os próprios logs de debug pelo Pusher', () => {
    expect(INTEGRATIONS.filter((def) => !def.streamsDebugOverPusher).map((def) => def.id)).toEqual(['pusher'])
  })

  it('rotinas padrão: status, GitHub, PRs do agêntico (2 min), fila do agêntico (1 min), resumos de IA (2 min) e tags de IA (3 min)', () => {
    expect(DEFAULT_CRON_JOBS.map((job) => job.id)).toEqual([HEALTH_CHECK_JOB_ID, 'github-issue-sync', 'agentic-pr-watch', 'agentic-queue-pump', 'ai-task-summary', 'ai-task-tags'])
    expect(DEFAULT_CRON_JOBS[1]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 2 } })
    expect(DEFAULT_CRON_JOBS[2]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 2 } })
    expect(DEFAULT_CRON_JOBS[3]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 1 } })
    expect(DEFAULT_CRON_JOBS[4]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 2 } })
    expect(DEFAULT_CRON_JOBS[5]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 3 } })
    const jobs = getIntegrationDef('crons').publicFields.find((field) => field.key === 'jobs')?.defaultValue
    expect(jobs).toEqual(DEFAULT_CRON_JOBS)
  })

  it('GitHub: token privado obrigatório, URL da API e comentário ligados por padrão, sem .env', () => {
    const def = getIntegrationDef('github')
    expect([...def.publicFields, ...def.secretFields].every((field) => !field.env)).toBe(true)
    expect(def.secretFields).toEqual([expect.objectContaining({ key: 'token', required: true })])
    expect(def.publicFields.find((field) => field.key === 'apiUrl')?.defaultValue).toBe('https://api.github.com')
    expect(def.publicFields.find((field) => field.key === 'commentOnCreate')?.defaultValue).toBe(true)
  })

  it('Provedores de IA: hub com rotas próprias e provedores filhos, sem .env', () => {
    expect(getIntegrationDef('ai').name).toBe('Provedores de IA')
    expect(integrationPath('ai')).toBe('/integracoes/ia')
    expect(integrationPath('ai_opencode')).toBe('/integracoes/ia/opencode')
    expect(integrationPath('ai_gemini')).toBe('/integracoes/ia/gemini')
    expect(integrationPath('ai_jev')).toBe('/integracoes/ia/jev')
    expect(hasCustomIntegrationPath('ai_opencode')).toBe(true)
    expect(hasCustomIntegrationPath('github')).toBe(false)
    expect(INTEGRATIONS.filter((def) => def.parent).map((def) => [def.id, def.parent])).toEqual([
      ['ai_opencode', 'ai'],
      ['ai_gemini', 'ai'],
      ['ai_jev', 'ai'],
    ])
    for (const id of ['ai', 'ai_opencode', 'ai_gemini', 'ai_jev'] as const) {
      const def = getIntegrationDef(id)
      expect([...def.publicFields, ...def.secretFields].every((field) => !field.env)).toBe(true)
    }
    expect(getIntegrationDef('ai_opencode').secretFields).toEqual([expect.objectContaining({ key: 'password', required: true })])
    expect(getIntegrationDef('ai_gemini').secretFields).toEqual([expect.objectContaining({ key: 'apiKey', required: true })])
    expect(getIntegrationDef('ai_jev').secretFields).toEqual([expect.objectContaining({ key: 'apiKey', required: true })])
    expect(getIntegrationDef('ai_jev').publicFields).toEqual([])
  })

  it('isCardManagedField só reconhece o grupo "card"', () => {
    expect(isCardManagedField({ group: 'card' })).toBe(true)
    expect(isCardManagedField({})).toBe(false)
  })
})
