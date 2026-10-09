import { describe, expect, it } from 'vitest'
import { buildIntegrationUpdateSchema } from '@/features/integrations/schemas/integration.schema'
import { DEFAULT_CRON_JOBS, getIntegrationDef } from '@/lib/integrations/catalog'

describe('buildIntegrationUpdateSchema', () => {
  it('aceita somente os campos da própria integração', () => {
    const schema = buildIntegrationUpdateSchema(getIntegrationDef('pusher'))
    expect(schema.safeParse({ publicValues: { appId: '123', mode: 'host', url: 'http://soketi:6001' } }).success).toBe(true)
    expect(schema.safeParse({ publicValues: { host: 'smtp' } }).success).toBe(false)
    expect(schema.safeParse({ secrets: { password: { action: 'clear' } } }).success).toBe(false)
    expect(schema.safeParse({ secrets: { secret: { action: 'clear' } } }).success).toBe(true)
  })

  it('valida limites numéricos, opções e URLs com mensagens em pt-BR', () => {
    const base = getIntegrationDef('pusher')
    const schema = buildIntegrationUpdateSchema({
      ...base,
      publicFields: [...base.publicFields, { key: 'timeout', label: 'Timeout', kind: 'number', min: 30 }],
    })
    const low = schema.safeParse({ publicValues: { timeout: 10 } })
    expect(low.success).toBe(false)
    expect(low.error?.issues[0].message).toMatch(/mínimo/)
    expect(schema.safeParse({ publicValues: { url: 'nao-e-url' } }).error?.issues[0].message).toMatch(/URL inválida/)
    expect(schema.safeParse({ publicValues: { url: 'http://soketi:6001/caminho' } }).error?.issues[0].message).toMatch(/sem caminho/)
    expect(schema.safeParse({ publicValues: { mode: 'outro' } }).error?.issues[0].message).toMatch(/opção inválida/)
  })

  it('valida as rotinas de cron: caminho /api/, agendamento e ids únicos', () => {
    const schema = buildIntegrationUpdateSchema(getIntegrationDef('crons'))
    expect(schema.safeParse({ publicValues: { jobs: DEFAULT_CRON_JOBS } }).success).toBe(true)

    const httpJob = { id: 'limpeza', label: 'Limpeza', kind: 'http', path: '/api/routines/limpeza', schedule: { type: 'daily', time: '03:00' }, enabled: true }
    expect(schema.safeParse({ publicValues: { jobs: [httpJob] } }).success).toBe(true)
    const badPath = schema.safeParse({ publicValues: { jobs: [{ ...httpJob, path: '/fora' }] } })
    expect(badPath.error?.issues[0].message).toMatch(/\/api\//)

    const badTime = schema.safeParse({
      publicValues: { jobs: [{ ...DEFAULT_CRON_JOBS[0], schedule: { type: 'daily', time: '99:00' } }] },
    })
    expect(badTime.success).toBe(false)

    const duplicated = schema.safeParse({ publicValues: { jobs: [DEFAULT_CRON_JOBS[0], DEFAULT_CRON_JOBS[0]] } })
    expect(duplicated.error?.issues[0].message).toMatch(/duplicada/)
  })

  it('API interna não aceita campos públicos nem segredos', () => {
    const schema = buildIntegrationUpdateSchema(getIntegrationDef('internal_api'))
    expect(schema.safeParse({ publicValues: { exportToken: 'a'.repeat(64) } }).success).toBe(false)
    expect(schema.safeParse({ secrets: { token: { action: 'clear' } } }).success).toBe(false)
    expect(schema.safeParse({ debugMode: true }).success).toBe(true)
  })

  it('segredo exige valor não vazio ao substituir', () => {
    const schema = buildIntegrationUpdateSchema(getIntegrationDef('crons'))
    expect(schema.safeParse({ secrets: { cronSecret: { action: 'set', value: '' } } }).success).toBe(false)
    expect(schema.safeParse({ secrets: { cronSecret: { action: 'set', value: 'x' } } }).success).toBe(true)
    expect(schema.safeParse({ secrets: { cronSecret: { action: 'set', value: 'senha com espaços' } } }).success).toBe(true)
  })

  it('campo público do tipo token aceita qualquer valor (sem mínimo nem restrição de espaços)', () => {
    const base = getIntegrationDef('pusher')
    const schema = buildIntegrationUpdateSchema({
      ...base,
      publicFields: [...base.publicFields, { key: 'apiToken', label: 'Token', kind: 'token' }],
    })
    expect(schema.safeParse({ publicValues: { apiToken: 'abc' } }).success).toBe(true)
    expect(schema.safeParse({ publicValues: { apiToken: 'com espaço' } }).success).toBe(true)
    expect(schema.safeParse({ publicValues: { apiToken: 'a'.repeat(501) } }).success).toBe(false)
  })
})
