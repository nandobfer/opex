import { describe, expect, it } from 'vitest'
import { buildIntegrationUpdateSchema } from '@/features/integrations/schemas/integration.schema'
import { DEFAULT_CRON_JOBS, TASK_TAGS_CONCLUDED_JOB_ID, getIntegrationDef } from '@/lib/integrations/catalog'

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

  it('valida o escopo das rotinas internas que aceitam escopo', () => {
    const schema = buildIntegrationUpdateSchema(getIntegrationDef('crons'))
    // A rotina com escopo é escolhida **por id**: novas rotinas internas podem entrar no fim da lista.
    const concluded = DEFAULT_CRON_JOBS.find((job) => job.id === TASK_TAGS_CONCLUDED_JOB_ID)!
    expect(concluded.scope).toBe('pending')
    expect(schema.safeParse({ publicValues: { jobs: [{ ...concluded, scope: 'all' }] } }).success).toBe(true)
    expect(schema.parse({ publicValues: { jobs: [{ ...concluded, scope: 'all' }] } }).publicValues?.jobs).toEqual([{ ...concluded, scope: 'all' }])
    expect(schema.safeParse({ publicValues: { jobs: [{ ...concluded, scope: 'outro' }] } }).success).toBe(false)
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

  it('SMTP e Storage S3 validam os próprios campos e limites', () => {
    const smtp = buildIntegrationUpdateSchema(getIntegrationDef('smtp'))
    expect(smtp.safeParse({ publicValues: { host: 'smtp.exemplo.com', port: 465 } }).success).toBe(true)
    expect(smtp.safeParse({ publicValues: { port: 70000 } }).error?.issues[0].message).toMatch(/máximo/)
    expect(smtp.safeParse({ publicValues: { bucket: 'x' } }).success).toBe(false)
    expect(smtp.safeParse({ secrets: { password: { action: 'set', value: 'segredo' } } }).success).toBe(true)

    const s3 = buildIntegrationUpdateSchema(getIntegrationDef('storage_s3'))
    expect(s3.safeParse({ publicValues: { endpoint: 'http://minio:9000', signedUrlExpiresSeconds: 60 } }).success).toBe(true)
    expect(s3.safeParse({ publicValues: { endpoint: 'nao-e-url' } }).error?.issues[0].message).toMatch(/URL inválida/)
    expect(s3.safeParse({ publicValues: { signedUrlExpiresSeconds: 30 } }).error?.issues[0].message).toMatch(/mínimo/)
    expect(s3.safeParse({ secrets: { secret: { action: 'clear' } } }).success).toBe(false)
    expect(s3.safeParse({ secrets: { secretKey: { action: 'clear' } } }).success).toBe(true)
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
