import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_CLEANUP_JOB_ID,
  BUILDER_MACHINE_CLEANUP_JOB_ID,
  OPEX_FILES_CLEANUP_JOB_ID,
  OPENCODE_QUOTA_JOB_ID,
  DEFAULT_CRON_JOBS,
  HEALTH_CHECK_JOB_ID,
  IN_DEVELOPMENT_INTEGRATIONS,
  INTEGRATIONS,
  INTEGRATIONS_BASE_PATH,
  INTEGRATION_IDS,
  TASK_TAGS_CONCLUDED_JOB_ID,
  cronJobIntegration,
  getInDevelopmentIntegration,
  getIntegrationDef,
  hasCustomIntegrationPath,
  integrationPath,
  isCardManagedField,
  isIntegrationId,
} from '@/lib/integrations/catalog'

describe('catálogo de integrações', () => {
  it('traz exatamente as integrações ativas', () => {
    const ids = ['pusher', 'internal_api', 'crons', 'github', 'ai', 'ai_opencode', 'ai_gemini', 'ai_anthropic', 'ai_openai', 'ai_deepseek', 'ai_jev', 'orcamentos', 'smtp', 'storage_s3', 'builder_machine', 'engramind']
    expect([...INTEGRATION_IDS]).toEqual(ids)
    expect(INTEGRATIONS.map((def) => def.id)).toEqual(ids)
    expect(isIntegrationId('pusher')).toBe(true)
    expect(isIntegrationId('whatsapp_orchestrator')).toBe(false)
  })

  it('Builder Machine: ativada pelo campo "Integração ativa" (nasce desligada), chave privada só pelo card, sem .env', () => {
    const def = getIntegrationDef('builder_machine')
    expect(def).toMatchObject({ name: 'Builder Machine', defaultEnvironment: 'interno', streamsDebugOverPusher: true })
    expect(def.publicFields).toEqual([expect.objectContaining({ key: 'active', kind: 'boolean', defaultValue: false, label: 'Integração ativa' })])
    expect(def.secretFields).toEqual([{ key: 'sshPrivateKey', label: 'Chave privada do servidor', group: 'card' }])
    expect([...def.publicFields, ...def.secretFields].every((field) => !field.env)).toBe(true)
  })

  it('limpeza da Builder Machine: diária às 03:00, nasce desligada (a ativação liga) e pertence à integração', () => {
    expect(DEFAULT_CRON_JOBS.find((job) => job.id === BUILDER_MACHINE_CLEANUP_JOB_ID)).toMatchObject({ kind: 'internal', enabled: false, schedule: { type: 'daily', time: '03:00' } })
    expect(cronJobIntegration(BUILDER_MACHINE_CLEANUP_JOB_ID)).toBe('builder_machine')
    expect(cronJobIntegration(HEALTH_CHECK_JOB_ID)).toBeNull()
  })

  it('Google Drive aparece como Em desenvolvimento, sem definição configurável', () => {
    expect(IN_DEVELOPMENT_INTEGRATIONS.map((item) => [item.id, item.name])).toEqual([['google_drive', 'Google Drive']])
    expect(getInDevelopmentIntegration('archflow')).toBeUndefined()
    expect(getInDevelopmentIntegration('google_drive')?.description).toBe(
      'Fonte de tarefas a partir de planilhas do Google Sheets',
    )
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

  it('rotinas padrão: status, GitHub, PRs do agêntico (2 min), fila do agêntico (1 min), resumos de IA (2 min), tags de IA (3 min), tags das concluídas (1 h, desligada), anexos abandonados (30 min) e quota do OpenCode (1 min)', () => {
    expect(DEFAULT_CRON_JOBS.map((job) => job.id)).toEqual([HEALTH_CHECK_JOB_ID, 'github-issue-sync', 'agentic-pr-watch', 'agentic-queue-pump', 'ai-task-summary', 'ai-task-tags', TASK_TAGS_CONCLUDED_JOB_ID, ATTACHMENT_CLEANUP_JOB_ID, OPEX_FILES_CLEANUP_JOB_ID, OPENCODE_QUOTA_JOB_ID, BUILDER_MACHINE_CLEANUP_JOB_ID, 'environments-registry-cleanup', 'opencode-sessions-cleanup', 'opex-agent-sessions-cleanup', 'maddox-agent-sessions-cleanup'])
    expect(DEFAULT_CRON_JOBS[1]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 2 } })
    expect(DEFAULT_CRON_JOBS[2]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 2 } })
    expect(DEFAULT_CRON_JOBS[3]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 1 } })
    expect(DEFAULT_CRON_JOBS[4]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 2 } })
    expect(DEFAULT_CRON_JOBS[5]).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 3 } })
    expect(DEFAULT_CRON_JOBS[6]).toMatchObject({ kind: 'internal', enabled: false, scope: 'pending', schedule: { type: 'interval', minutes: 60 } })
    expect(DEFAULT_CRON_JOBS[7]).toMatchObject({ id: ATTACHMENT_CLEANUP_JOB_ID, kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 30 } })
    expect(DEFAULT_CRON_JOBS[8]).toMatchObject({ id: OPEX_FILES_CLEANUP_JOB_ID, kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 60 } })
    expect(DEFAULT_CRON_JOBS.find((job) => job.id === OPENCODE_QUOTA_JOB_ID)).toMatchObject({ kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 1 } })
    expect(cronJobIntegration(OPENCODE_QUOTA_JOB_ID)).toBeNull()
    const jobs = getIntegrationDef('crons').publicFields.find((field) => field.key === 'jobs')?.defaultValue
    expect(jobs).toEqual(DEFAULT_CRON_JOBS)
  })

  it('OpenCode: motivo do botão Atualizar da quota (manual por padrão), sem arquivo de export nem .env', () => {
    const fields = getIntegrationDef('ai_opencode').publicFields
    expect(fields.find((field) => field.key === 'quotaRefreshReason')).toMatchObject({ kind: 'segmented', defaultValue: 'manual', options: [{ value: 'manual' }, { value: 'poll' }] })
    expect(fields.find((field) => field.key === 'quotaRefreshReason')?.env).toBeUndefined()
    expect(fields.some((field) => field.key === 'quotaExportPath')).toBe(false)
  })

  it('GitHub: token privado obrigatório, URL da API e comentário ligados por padrão, sem .env', () => {
    const def = getIntegrationDef('github')
    expect([...def.publicFields, ...def.secretFields].every((field) => !field.env)).toBe(true)
    expect(def.secretFields).toEqual([expect.objectContaining({ key: 'token', required: true })])
    expect(def.publicFields.find((field) => field.key === 'apiUrl')?.defaultValue).toBe('https://api.github.com')
    expect(def.publicFields.find((field) => field.key === 'commentOnCreate')?.defaultValue).toBe(true)
  })

  it('Inteligência Artificial: hub com rotas próprias e provedores filhos, sem .env', () => {
    expect(getIntegrationDef('ai').name).toBe('Inteligência Artificial')
    expect(integrationPath('ai')).toBe('/integracoes/ia')
    expect(integrationPath('ai_opencode')).toBe('/integracoes/ia/opencode')
    expect(integrationPath('ai_gemini')).toBe('/integracoes/ia/gemini')
    expect(integrationPath('ai_anthropic')).toBe('/integracoes/ia/anthropic')
    expect(integrationPath('ai_openai')).toBe('/integracoes/ia/openai')
    expect(integrationPath('ai_deepseek')).toBe('/integracoes/ia/deepseek')
    expect(integrationPath('ai_jev')).toBe('/integracoes/ia/jev')
    expect(hasCustomIntegrationPath('ai_opencode')).toBe(true)
    expect(hasCustomIntegrationPath('github')).toBe(false)
    expect(INTEGRATIONS.filter((def) => def.parent).map((def) => [def.id, def.parent])).toEqual([
      ['ai_opencode', 'ai'],
      ['ai_gemini', 'ai'],
      ['ai_anthropic', 'ai'],
      ['ai_openai', 'ai'],
      ['ai_deepseek', 'ai'],
      ['ai_jev', 'ai'],
    ])
    for (const id of ['ai', 'ai_opencode', 'ai_gemini', 'ai_anthropic', 'ai_openai', 'ai_deepseek', 'ai_jev'] as const) {
      const def = getIntegrationDef(id)
      expect([...def.publicFields, ...def.secretFields].every((field) => !field.env)).toBe(true)
    }
    expect(getIntegrationDef('ai_opencode').secretFields).toEqual([expect.objectContaining({ key: 'password', required: true }), expect.objectContaining({ key: 'sshPrivateKey', multiline: true })])
    // Acesso SSH (só ciclo de vida do serviço, aba Controles): opcional, sem .env.
    expect(getIntegrationDef('ai_opencode').publicFields.filter((field) => field.key.startsWith('ssh') || field.key === 'opencodeBin').map((field) => [field.key, Boolean(field.required)])).toEqual([
      ['sshHost', false],
      ['sshPort', false],
      ['sshUser', false],
      ['opencodeBin', false],
      ['sshHostFingerprint', false],
    ])
    for (const id of ['ai_gemini', 'ai_anthropic', 'ai_openai', 'ai_deepseek'] as const) {
      expect(getIntegrationDef(id).secretFields).toEqual([expect.objectContaining({ key: 'apiKey', required: true })])
    }
    expect(getIntegrationDef('ai_jev').secretFields).toEqual([expect.objectContaining({ key: 'apiKey', required: true })])
    expect(getIntegrationDef('ai_jev').publicFields).toEqual([])
  })

  it('SMTP e Storage S3: campos, defaults e sem .env', () => {
    const smtp = getIntegrationDef('smtp')
    expect(smtp.name).toBe('SMTP')
    expect(smtp.defaultEnvironment).toBe('interno')
    expect(integrationPath('smtp')).toBe('/integracoes/smtp')
    expect([...smtp.publicFields, ...smtp.secretFields].every((field) => !field.env)).toBe(true)
    expect(smtp.publicFields.find((field) => field.key === 'host')).toMatchObject({ required: true })
    expect(smtp.publicFields.find((field) => field.key === 'port')?.defaultValue).toBe(587)
    expect(smtp.secretFields).toEqual([expect.objectContaining({ key: 'password' })])

    const s3 = getIntegrationDef('storage_s3')
    expect(s3.name).toBe('Storage S3')
    expect(s3.defaultEnvironment).toBe('interno')
    expect(integrationPath('storage_s3')).toBe('/integracoes/storage_s3')
    expect([...s3.publicFields, ...s3.secretFields].every((field) => !field.env)).toBe(true)
    expect(s3.publicFields.find((field) => field.key === 'endpoint')).toMatchObject({ kind: 'url', required: true })
    expect(s3.publicFields.find((field) => field.key === 'region')?.defaultValue).toBe('us-east-1')
    expect(s3.publicFields.find((field) => field.key === 'bucket')?.defaultValue).toBe('default')
    expect(s3.publicFields.find((field) => field.key === 'signedUrlExpiresSeconds')?.defaultValue).toBe(3600)
    expect(s3.secretFields.map((field) => field.key)).toEqual(['accessKey', 'secretKey'])
  })

  it('isCardManagedField só reconhece o grupo "card"', () => {
    expect(isCardManagedField({ group: 'card' })).toBe(true)
    expect(isCardManagedField({})).toBe(false)
  })
})
