import { describe, expect, it } from 'vitest'

/** "IA do Opex": provedor do Opex → chaves do Engramind (URL implícita), origem derivada e schemas sem URL. */

import { DEEPSEEK_API_URL, OPENAI_API_URL } from '@/lib/ai/endpoints'
import { deriveOrigin, embeddingProviderOf, embeddingSettingsOf, opexKeyProviderOf, redatorProviderOf, redatorSettingsOf, type AiSourceSnapshot } from '@/features/engramind/ai-source'
import { z } from 'zod'
import { applyAiSourceSchema, applyAiSourceToolSchema, embeddingSourceSchema, redatorSourceSchema } from '@/features/engramind/schemas/ai-source'

describe('mapeamento do Redator', () => {
  it.each([
    ['gemini', 'gemini', null],
    ['anthropic', 'anthropic', null],
    ['openai', 'openai_compatible', OPENAI_API_URL],
    ['deepseek', 'openai_compatible', DEEPSEEK_API_URL],
  ] as const)('%s → %s com a URL do provedor', (provider, engramind, url) => {
    const settings = redatorSettingsOf({ provider, model: 'm1', fallbackModels: ['m2'] })
    expect(settings).toEqual({ 'redator.provider': engramind, 'redator.model': 'm1', 'redator.base_url': url, 'redator.fallback_models': ['m2'] })
    expect(redatorProviderOf(settings)).toBe(provider)
  })

  it('configuração própria do Engramind (outra URL) não corresponde a provedor do Opex', () => {
    expect(redatorProviderOf({ 'redator.provider': 'openai_compatible', 'redator.base_url': 'https://openrouter.ai/api/v1' })).toBeNull()
  })
})

describe('mapeamento do embedding', () => {
  it('local e desligado não usam URL; OpenAI vai como openai_compatible com a URL oficial', () => {
    expect(embeddingSettingsOf({ provider: 'local', model: 'multilingual-e5-small', dimensions: 512 })).toEqual({ 'embedding.provider': 'local', 'embedding.base_url': null, 'embedding.dimensions': null, 'embedding.model': 'multilingual-e5-small' })
    expect(embeddingSettingsOf({ provider: 'off', model: null, dimensions: null })).toEqual({ 'embedding.provider': 'off', 'embedding.base_url': null, 'embedding.dimensions': null })
    const openai = embeddingSettingsOf({ provider: 'openai', model: 'text-embedding-3-small', dimensions: 512 })
    expect(openai).toMatchObject({ 'embedding.provider': 'openai_compatible', 'embedding.base_url': OPENAI_API_URL, 'embedding.dimensions': 512 })
    expect(embeddingProviderOf(openai)).toBe('openai')
    expect(embeddingProviderOf({ 'embedding.provider': 'ollama', 'embedding.base_url': 'http://127.0.0.1:11434' })).toBeNull()
  })

  it('integração do Opex → provedor da chave', () => {
    expect(opexKeyProviderOf('ai_openai')).toBe('openai')
    expect(opexKeyProviderOf('ai_opencode')).toBeNull()
  })
})

describe('origem derivada do valor em uso', () => {
  const snapshot: AiSourceSnapshot = { provider: 'openai', model: 'gpt-4o', fallbackModels: [], dimensions: null, syncedAt: '2026-10-31T12:00:00.000Z', syncError: null, appliedAt: '2026-10-31T12:00:00.000Z' }
  const current = redatorSettingsOf({ provider: 'openai', model: 'gpt-4o', fallbackModels: [] })

  it('bate com o snapshot e a chave não mudou depois → opex', () => {
    expect(deriveOrigin('redator', current, snapshot, '2026-10-31T12:00:01.000Z')).toBe('opex')
  })

  it('modelo trocado por fora (ferramenta/CLI) → engramind', () => {
    expect(deriveOrigin('redator', { ...current, 'redator.model': 'gpt-4o-mini' }, snapshot, null)).toBe('engramind')
  })

  it('chave gravada à mão depois da última cópia → engramind', () => {
    expect(deriveOrigin('redator', current, snapshot, '2026-10-31T13:00:00.000Z')).toBe('engramind')
  })

  it('sem snapshot → none', () => {
    expect(deriveOrigin('redator', current, null, null)).toBe('none')
  })
})

describe('schemas', () => {
  it('até 5 reservas, sem repetir e sem o principal', () => {
    expect(redatorSourceSchema.safeParse({ provider: 'openai', model: 'a', fallbackModels: ['b', 'c', 'd', 'e', 'f'] }).success).toBe(true)
    expect(redatorSourceSchema.safeParse({ provider: 'openai', model: 'a', fallbackModels: ['b', 'c', 'd', 'e', 'f', 'g'] }).success).toBe(false)
    expect(redatorSourceSchema.safeParse({ provider: 'openai', model: 'a', fallbackModels: ['a'] }).success).toBe(false)
    expect(redatorSourceSchema.safeParse({ provider: 'openai', model: 'a', fallbackModels: ['b', 'b'] }).success).toBe(false)
  })

  it('nenhum schema aceita URL nem OpenCode', () => {
    expect(redatorSourceSchema.safeParse({ provider: 'openai', model: 'a', baseUrl: 'https://x' }).success).toBe(false)
    expect(embeddingSourceSchema.safeParse({ provider: 'openai', model: 'a', base_url: 'https://x' }).success).toBe(false)
    expect(redatorSourceSchema.safeParse({ provider: 'opencode', model: 'a' }).success).toBe(false)
    expect(applyAiSourceSchema.safeParse({ section: 'redator', source: { provider: 'gemini', model: 'g' }, url: 'x' }).success).toBe(false)
  })

  it('embedding: modelo obrigatório exceto desligado', () => {
    expect(embeddingSourceSchema.safeParse({ provider: 'local' }).success).toBe(false)
    expect(embeddingSourceSchema.safeParse({ provider: 'off' }).success).toBe(true)
  })
})

describe('entrada da ferramenta do agente', () => {
  it('é um objeto no JSON Schema (provedores de IA e MCP exigem type: object)', () => {
    expect(z.toJSONSchema(applyAiSourceToolSchema, { io: 'input', unrepresentable: 'any' })).toMatchObject({ type: 'object' })
  })

  it('valida pela seção e devolve a forma do serviço', () => {
    expect(applyAiSourceToolSchema.parse({ section: 'embedding', source: { provider: 'local', model: 'bge-m3' } })).toEqual({ section: 'embedding', source: { provider: 'local', model: 'bge-m3', dimensions: null } })
    expect(applyAiSourceToolSchema.safeParse({ section: 'embedding', source: { provider: 'gemini', model: 'g', fallbackModels: ['x'] } }).success).toBe(false)
    expect(applyAiSourceToolSchema.safeParse({ section: 'redator', source: { provider: 'local', model: 'x' } }).success).toBe(false)
  })
})
