import { describe, expect, it } from 'vitest'
import { buildSettingsSchema, changedSettings } from '@/features/engramind/schemas/settings'
import { batchLimitError, parseImportFile } from '@/features/engramind/schemas/import'
import { connectionInputSchema } from '@/features/engramind/schemas/connection'
import { envUpdateSchema } from '@/features/engramind/schemas/env'

const metas = [
  { key: 'limits.rate_per_minute', type: 'integer', min: 1, max: 100000 },
  { key: 'memory.similar_threshold', type: 'number', min: 0, max: 1 },
  { key: 'context.default_format', type: 'enum', choices: ['tagged', 'markdown', 'json'] },
  { key: 'categories.list', type: 'categories', min: 1, max: 50 },
  { key: 'redator.fallback_models', type: 'list', max: 5 },
  { key: 'redator.base_url', type: 'url' },
]

describe('configurações geradas do metadado', () => {
  const schema = buildSettingsSchema(metas)

  it('aceita valores dentro da regra e null (volta ao padrão)', () => {
    expect(schema.safeParse({ 'limits.rate_per_minute': 1200, 'context.default_format': 'markdown', 'redator.base_url': null }).success).toBe(true)
    expect(schema.safeParse({ 'categories.list': [{ key: 'RULES', label: 'Regras', priority: 10 }] }).success).toBe(true)
  })

  it('recusa intervalo, enum, categoria inválida, lista longa e chave desconhecida, com mensagem pt-BR', () => {
    const result = schema.safeParse({ 'limits.rate_per_minute': 0 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Mínimo 1')
    expect(schema.safeParse({ 'memory.similar_threshold': 1.5 }).success).toBe(false)
    expect(schema.safeParse({ 'context.default_format': 'yaml' }).success).toBe(false)
    expect(schema.safeParse({ 'categories.list': [{ key: 'rules', label: 'x', priority: 1 }] }).success).toBe(false)
    expect(schema.safeParse({ 'categories.list': [] }).success).toBe(false)
    expect(schema.safeParse({ 'redator.fallback_models': ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false)
    expect(schema.safeParse({ 'outra.chave': 1 }).error?.issues[0]?.message).toContain('desconhecida')
  })

  it('só as chaves alteradas vão no PUT', () => {
    expect(changedSettings({ a: 1, b: null, c: [1] }, { a: 1, b: 2, c: [1] })).toEqual({ b: 2 })
    expect(changedSettings({ a: 5 }, { a: null })).toEqual({ a: null })
  })
})

describe('importação', () => {
  it('lê lista JSON, { memories } e JSONL', () => {
    expect(parseImportFile('[{"text":"Rode só os testes afetados."}]').items).toHaveLength(1)
    expect(parseImportFile('{"memories":[{"text":"a b c"},{"text":"d e f","status":"permanent"}]}').items).toHaveLength(2)
    expect(parseImportFile('{"text":"um"}\n{"text":"dois"}\n').items).toHaveLength(2)
  })

  it('aponta o erro pelo índice e recusa formato desconhecido', () => {
    const result = parseImportFile('[{"text":"ok"},{"text":""},{"texto":"x"}]')
    expect(result.items).toHaveLength(1)
    expect(result.errors.map((error) => error.index)).toEqual([1, 2])
    expect(parseImportFile('{"foo":1}').fatal).toContain('lista JSON')
    expect(parseImportFile('{"text":"a"}\nnão json').fatal).toContain('linha 2')
  })

  it('acima de limits.max_batch é recusado antes do envio', () => {
    expect(batchLimitError(100, 100)).toBeNull()
    expect(batchLimitError(101, 100)).toContain('limite por lote é 100')
  })
})

describe('conexão e variáveis', () => {
  it('URLs sem barra final e token no formato eng.tk_', () => {
    const parsed = connectionInputSchema.parse({ baseUrl: 'http://engramind-api:8000/', opexPublicUrl: 'http://opex:3100', environmentId: null, adminToken: '' })
    expect(parsed.baseUrl).toBe('http://engramind-api:8000')
    expect(connectionInputSchema.safeParse({ baseUrl: 'http://x', opexPublicUrl: 'http://y', environmentId: null, adminToken: 'eng.tk_123' }).success).toBe(false)
    expect(connectionInputSchema.safeParse({ baseUrl: 'http://x', opexPublicUrl: 'http://y', environmentId: null, adminToken: `eng.tk_3f9e1a7c.${'a'.repeat(32)}` }).success).toBe(true)
  })

  it('valida cada variável editável pelo tipo', () => {
    const hash = 'a'.repeat(64)
    expect(envUpdateSchema.safeParse({ hash, changes: { APP_PORT: '8001', LOG_FORMAT: 'json', LITESTREAM_ENABLED: 'true' } }).success).toBe(true)
    expect(envUpdateSchema.safeParse({ hash, changes: { APP_PORT: '70000' } }).success).toBe(false)
    expect(envUpdateSchema.safeParse({ hash, changes: { LOG_FORMAT: 'pretty' } }).success).toBe(false)
    expect(envUpdateSchema.safeParse({ hash, changes: { TOKEN_PEPPER: 'x' } }).success).toBe(false)
    expect(envUpdateSchema.safeParse({ hash, changes: {} }).success).toBe(false)
    expect(envUpdateSchema.safeParse({ hash, changes: {}, litestreamSecret: 'novo' }).success).toBe(true)
  })
})
