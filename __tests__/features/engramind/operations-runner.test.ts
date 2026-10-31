import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Serviço das operações: validação pelo metadado, token próprio protegido, auditoria por período e importação. */

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  audits: [] as { id: string; acao: string; depois: Record<string, unknown> }[],
  publish: vi.fn(async () => {}),
}))

vi.mock('@/features/engramind/server/client', () => ({ engramindCall: mocks.call }))
vi.mock('@/features/engramind/server/connection', () => ({ fetchWhoami: async () => ({ token_id: 'tk_0e000001', kind: 'admin', scopes: ['read', 'write', 'delete'], app: { id: 'app_0e000001', slug: 'opex' }, agent: null }), resetWhoamiCache: vi.fn() }))
vi.mock('@/features/engramind/server/shared', () => ({
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', EXECUTAR: 'EXECUTAR', MOVER: 'MOVER', IMPORTAR: 'IMPORTAR' },
  auditEngramind: async (_actor: string, id: string, acao: string, depois: Record<string, unknown>) => {
    mocks.audits.push({ id, acao, depois })
  },
  engramindLog: { info: vi.fn() },
  publishEngramind: mocks.publish,
}))

import { auditWithPeriod, importIdempotencyKey, importEngramindMemories, runEngramindOperation } from '@/features/engramind/server/operations-runner'

const SETTINGS = {
  settings: [
    { key: 'limits.rate_per_minute', type: 'integer', min: 1, max: 100000, value: 600, default: 600, description: '', channel_override: false },
    { key: 'limits.max_batch', type: 'integer', min: 1, max: 1000, value: 2, default: 100, description: '', channel_override: false },
    { key: 'redator.api_key', type: 'secret', secret: true, value: null, default: null, description: '', channel_override: false },
  ],
}

describe('runEngramindOperation', () => {
  beforeEach(() => {
    mocks.call.mockReset()
    mocks.audits = []
    mocks.publish.mockClear()
  })

  it('leitura vai direto, sem auditoria nem evento', async () => {
    mocks.call.mockResolvedValue({ channels: [] })
    await runEngramindOperation('list_channels', { include_archived: true }, 'local')
    expect(mocks.call).toHaveBeenCalledWith('GET', { path: '/v1/channels', query: { include_archived: true } }, { sensitiveBody: false })
    expect(mocks.audits).toEqual([])
  })

  it('configurações: valida pelo metadado antes do PUT e audita só as chaves', async () => {
    mocks.call.mockImplementation(async (method: string) => (method === 'GET' ? SETTINGS : { settings: [] }))
    await expect(runEngramindOperation('update_settings', { settings: { 'limits.rate_per_minute': 0 } }, 'local')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Mínimo 1') })
    await expect(runEngramindOperation('update_settings', { settings: { 'redator.api_key': 'sk' } }, 'local')).rejects.toMatchObject({ code: 'ENGRAMIND_SETTING_IS_SECRET' })
    await runEngramindOperation('update_settings', { settings: { 'limits.rate_per_minute': 1200 } }, 'local')
    expect(mocks.call).toHaveBeenLastCalledWith('PUT', { path: '/v1/settings', body: { 'limits.rate_per_minute': 1200 } }, { sensitiveBody: false })
    expect(mocks.audits.at(-1)).toMatchObject({ id: 'update_settings', acao: 'ATUALIZAR' })
    expect(mocks.publish).toHaveBeenCalledWith({ type: 'settings.updated', channel: null, keys: ['limits.rate_per_minute'] })
  })

  it('segredo: o valor nunca vai para a auditoria e o corpo segue como sensível', async () => {
    mocks.call.mockResolvedValue({ key: 'redator.api_key', configured: true })
    await runEngramindOperation('set_secret', { key: 'redator.api_key', value: 'sk-muito-secreto' }, 'local')
    expect(mocks.call.mock.calls[0]![2]).toEqual({ sensitiveBody: true })
    expect(JSON.stringify(mocks.audits)).not.toContain('sk-muito-secreto')
  })

  it('o token do próprio Opex não é revogado nem rebaixado', async () => {
    await expect(runEngramindOperation('revoke_token', { token: 'tk_0e000001' }, 'local')).rejects.toMatchObject({ code: 'ENGRAMIND_OWN_TOKEN' })
    await expect(runEngramindOperation('update_token', { token: 'tk_0e000001', scopes: ['read'] }, 'local')).rejects.toMatchObject({ code: 'ENGRAMIND_OWN_TOKEN' })
    mocks.call.mockResolvedValue({})
    await runEngramindOperation('update_token', { token: 'tk_0e000001', label: 'Opex (servidor)' }, 'local')
    await runEngramindOperation('revoke_token', { token: 'tk_0ther001' }, 'local')
    expect(mocks.audits.map((audit) => audit.acao)).toEqual(['ATUALIZAR', 'EXCLUIR'])
  })

  it('o acesso do Opex não é cortado: token próprio sem validade nova, app do Opex sem desativar nem excluir', async () => {
    mocks.call.mockReset()
    mocks.call.mockResolvedValue({})
    await expect(runEngramindOperation('update_token', { token: 'tk_0e000001', expires_at: '2026-11-01T00:00:00Z' }, 'local')).rejects.toMatchObject({ status: 409, code: 'ENGRAMIND_OWN_TOKEN' })
    await expect(runEngramindOperation('update_app', { app: 'opex', disabled: true }, 'local')).rejects.toMatchObject({ code: 'ENGRAMIND_OWN_TOKEN' })
    await expect(runEngramindOperation('update_app', { app: 'app_0e000001', disabled: true }, 'local')).rejects.toMatchObject({ code: 'ENGRAMIND_OWN_TOKEN' })
    await expect(runEngramindOperation('delete_app', { app: 'opex' }, 'local')).rejects.toMatchObject({ code: 'ENGRAMIND_OWN_TOKEN' })
    expect(mocks.call).not.toHaveBeenCalled()
    await runEngramindOperation('update_token', { token: 'tk_0e000001', expires_at: null }, 'local')
    await runEngramindOperation('update_app', { app: 'opex', name: 'Opex (servidor)' }, 'local')
    await runEngramindOperation('update_app', { app: 'outro', disabled: true }, 'local')
    await runEngramindOperation('delete_app', { app: 'outro' }, 'local')
    await runEngramindOperation('update_token', { token: 'tk_0ther001', expires_at: '2026-11-01T00:00:00Z' }, 'local')
    expect(mocks.call).toHaveBeenCalledTimes(5)
  })

  it('entrada inválida dá 400 com a mensagem do schema', async () => {
    await expect(runEngramindOperation('create_channel', { slug: 'Eng Global', name: 'x' }, 'local')).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
    await expect(runEngramindOperation('nao_existe', {}, 'local')).rejects.toMatchObject({ status: 404 })
  })
})

describe('auditoria por período (recorte no Opex)', () => {
  beforeEach(() => mocks.call.mockReset())

  it('lê do mais recente até passar do "desde" e corta o "até"', async () => {
    mocks.call
      .mockResolvedValueOnce({ events: [{ id: 3, at: '2026-10-30T12:00:00Z' }, { id: 2, at: '2026-10-20T12:00:00Z' }], next_cursor: 'c2' })
      .mockResolvedValueOnce({ events: [{ id: 1, at: '2026-10-10T12:00:00Z' }, { id: 0, at: '2026-09-01T12:00:00Z' }], next_cursor: 'c3' })
    const result = await auditWithPeriod({ entity: 'token', since: '2026-10-05T00:00:00Z', until: '2026-10-25T00:00:00Z' })
    expect(result.events.map((event) => event.id)).toEqual([2, 1])
    expect(mocks.call).toHaveBeenCalledTimes(2)
    expect(mocks.call.mock.calls[0]![1]).toMatchObject({ query: { entity: 'token', limit: 200 } })
  })
})

describe('importação', () => {
  beforeEach(() => {
    mocks.call.mockReset()
    mocks.audits = []
  })

  it('a chave de idempotência depende só do canal e do conteúdo', () => {
    const a = importIdempotencyKey({ channel: 'eng/global', memories: [{ text: 'a b c' }] })
    expect(importIdempotencyKey({ channel: 'eng/global', memories: [{ text: 'a b c' }] })).toBe(a)
    expect(importIdempotencyKey({ channel: 'eng/outro', memories: [{ text: 'a b c' }] })).not.toBe(a)
  })

  it('acima de limits.max_batch é recusado sem chamar o import; dentro, envia com a chave derivada e audita a contagem', async () => {
    mocks.call.mockImplementation(async (_method: string, request: { path: string }) => (request.path === '/v1/settings' ? SETTINGS : { created: [{ index: 0, id: 'm_1' }], duplicates: [{ index: 1, existing_id: 'm_0' }] }))
    await expect(importEngramindMemories({ channel: 'eng/global', memories: [{ text: 'um' }, { text: 'dois' }, { text: 'três' }] }, 'local')).rejects.toMatchObject({ code: 'ENGRAMIND_BATCH_TOO_LARGE' })
    expect(mocks.call.mock.calls.some((call) => call[1].path === '/v1/memories/import')).toBe(false)
    const result = await importEngramindMemories({ channel: 'eng/global', memories: [{ text: 'um' }, { text: 'dois' }] }, 'local')
    expect(result.duplicates[0]!.existing_id).toBe('m_0')
    const importCall = mocks.call.mock.calls.find((call) => call[1].path === '/v1/memories/import')!
    expect(importCall[2].idempotencyKey).toMatch(/^opex-import-[0-9a-f]{48}$/)
    expect(mocks.audits.at(-1)).toMatchObject({ acao: 'IMPORTAR', depois: { channel: 'eng/global', created: 1, duplicates: 1 } })
  })
})
