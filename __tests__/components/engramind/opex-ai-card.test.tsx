/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Card "IA do Opex" (aba Provedores do Engramind): os mesmos seletores de provedor/modelo da tela de IA,
 * sem campo de URL, selo de origem, reservas, "Reenviar a chave", reindexação e tempo real.
 */

type Section = Record<string, unknown>
const mocks = vi.hoisted(() => ({
  data: null as null | { redator: Record<string, unknown>; embedding: Record<string, unknown>; reindexing: boolean },
  providers: [] as { id: string; integrationId: string; name: string; configured: boolean; connected: boolean }[],
  applied: [] as unknown[],
  tested: [] as unknown[],
  resent: [] as unknown[],
  applyImpl: (async () => ({ applied: true, keySynced: true })) as (input: unknown) => Promise<unknown>,
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/ai/hooks/useAi', () => ({
  useAiProviderStatuses: () => ({ providers: mocks.providers, isLoading: false }),
  useAiModels: (provider: string | null) => ({ data: provider ? [{ id: `${provider}-m1`, name: `${provider}-m1`, variants: [], group: null, contextWindow: null, free: false }] : undefined, isLoading: false, isError: false, error: null }),
}))
vi.mock('@/features/engramind/hooks/useOpexAiSource', () => ({
  useOpexAiSource: () => ({ data: mocks.data, isLoading: false, error: null, refetch: vi.fn() }),
  useApplyOpexAiSource: () => ({
    mutateAsync: async (input: unknown) => {
      mocks.applied.push(input)
      return mocks.applyImpl(input)
    },
    isPending: false,
  }),
  useTestOpexAiSource: () => ({
    mutateAsync: async (input: unknown) => {
      mocks.tested.push(input)
      return { model: 'x', latency_ms: 10 }
    },
    isPending: false,
  }),
  useResendOpexAiKey: () => ({ mutate: (section: unknown) => mocks.resent.push(section), isPending: false }),
  useLocalEmbeddingModels: () => ({ data: [{ id: 'multilingual-e5-small', name: 'multilingual-e5-small', variants: [], group: '384 dimensões', contextWindow: null, free: true }], isLoading: false, isError: false, error: null }),
}))

import { OpexAiCard } from '@/features/engramind/components/integration/providers/opex-ai/OpexAiCard'

const section = (over: Section): Section => ({
  origin: 'opex',
  provider: null,
  model: null,
  fallbackModels: [],
  dimensions: null,
  current: { provider: null, model: null },
  currentOpexProvider: null,
  keyConfigured: true,
  keyUpdatedAt: null,
  syncedAt: '2026-10-31T12:00:00.000Z',
  syncError: null,
  sourceKeyMissing: false,
  ...over,
})
const status = (id: string, name: string, connected: boolean) => ({ id, integrationId: `ai_${id}`, name, configured: connected, connected })
const radios = (container: HTMLElement) => within(container).getAllByRole('radio')
/** Espera a validação inicial do formulário (react-hook-form) habilitar o botão antes de clicar. */
async function clickWhenEnabled(button: HTMLElement) {
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  fireEvent.click(button)
}

beforeEach(() => {
  mocks.providers = [status('opencode', 'OpenCode', true), status('gemini', 'Gemini', true), status('anthropic', 'Anthropic', false), status('openai', 'OpenAI', true), status('deepseek', 'DeepSeek', true)]
  mocks.data = {
    redator: section({ section: 'redator', provider: 'openai', model: 'openai-m1', fallbackModels: ['gpt-4o-mini'], current: { provider: 'openai_compatible', model: 'openai-m1' }, currentOpexProvider: 'openai' }),
    embedding: section({ section: 'embedding', origin: 'none', provider: null, current: { provider: 'local', model: 'multilingual-e5-small' }, currentOpexProvider: 'local' }),
    reindexing: false,
  }
  mocks.applied = []
  mocks.tested = []
  mocks.resent = []
  mocks.applyImpl = async () => ({ applied: true, keySynced: true })
})

describe('OpexAiCard', () => {
  it('Redator só com os provedores do Opex (sem OpenCode), desconectado desabilitado; embedding com Local e Desligado', () => {
    render(<OpexAiCard />)
    const redator = screen.getByTestId('redator-source')
    expect(radios(redator).map((radio) => radio.textContent)).toEqual(['Gemini', 'Anthropic', 'OpenAI', 'DeepSeek'])
    expect(radios(redator).find((radio) => radio.textContent === 'Anthropic')!.hasAttribute('disabled')).toBe(true)
    const embedding = screen.getByTestId('embedding-source')
    expect(radios(embedding).map((radio) => radio.textContent)).toEqual(['Local', 'Gemini', 'OpenAI', 'Desligado'])
  })

  it('não existe campo de URL do provedor', () => {
    render(<OpexAiCard />)
    expect(screen.queryByLabelText(/URL/i)).toBeNull()
    expect(document.body.textContent).not.toMatch(/base_url|URL do provedor/)
  })

  it('selos de origem: Vem do Opex, ainda não aplicado e Configurado no Engramind', () => {
    const { rerender } = render(<OpexAiCard />)
    expect(screen.getByTestId('source-status-redator').textContent).toContain('Vem do Opex · OpenAI · openai-m1')
    expect(screen.getByTestId('source-status-embedding').textContent).toContain('Ainda não aplicado')
    mocks.data = { ...mocks.data!, redator: { ...mocks.data!.redator, origin: 'engramind', current: { provider: 'anthropic', model: 'claude-x' } } }
    rerender(<OpexAiCard />)
    expect(screen.getByTestId('source-status-redator').textContent).toContain('Configurado no Engramind · anthropic · claude-x')
  })

  it('reservas aparecem como chips e Aplicar envia provedor, modelo e reservas, sem chave nem URL', async () => {
    render(<OpexAiCard />)
    expect(within(screen.getByTestId('redator-source')).getByText('gpt-4o-mini')).toBeTruthy()
    await clickWhenEnabled(screen.getByRole('button', { name: /Aplicar no Redator/ }))
    await waitFor(() => expect(mocks.applied).toHaveLength(1))
    expect(mocks.applied[0]).toEqual({ section: 'redator', source: { provider: 'openai', model: 'openai-m1', fallbackModels: ['gpt-4o-mini'] } })
  })

  it('trocar de provedor limpa modelo e reservas', async () => {
    render(<OpexAiCard />)
    const redator = screen.getByTestId('redator-source')
    fireEvent.click(radios(redator).find((radio) => radio.textContent === 'Gemini')!)
    await waitFor(() => expect(within(redator).queryByText('gpt-4o-mini')).toBeNull())
    expect(within(redator).getAllByText('Escolha o modelo').length).toBeGreaterThan(0)
  })

  it('Testar com esta chave manda a proposta da seção', async () => {
    render(<OpexAiCard />)
    await clickWhenEnabled(within(screen.getByTestId('redator-source')).getByRole('button', { name: /Testar com esta chave/ }))
    await waitFor(() => expect(mocks.tested).toHaveLength(1))
    expect(mocks.tested[0]).toMatchObject({ section: 'redator', source: { provider: 'openai', model: 'openai-m1' } })
    expect(await screen.findByText('Teste concluído')).toBeTruthy()
  })

  it('chave não sincronizada mostra "Reenviar a chave"; chave apagada no Opex só avisa', () => {
    mocks.data = { ...mocks.data!, redator: { ...mocks.data!.redator, syncError: 'Engramind fora do ar' } }
    const { rerender } = render(<OpexAiCard />)
    fireEvent.click(screen.getByRole('button', { name: /Reenviar a chave/ }))
    expect(mocks.resent).toEqual(['redator'])
    mocks.data = { ...mocks.data!, redator: { ...mocks.data!.redator, syncError: 'Chave apagada no Opex', sourceKeyMissing: true } }
    rerender(<OpexAiCard />)
    expect(screen.getByText('A chave do OpenAI foi apagada no Opex')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Reenviar a chave/ })).toBeNull()
  })

  it('embedding pede confirmação da reindexação; com reindexação em andamento, Aplicar fica desabilitado', async () => {
    const { rerender } = render(<OpexAiCard />)
    await clickWhenEnabled(screen.getByRole('button', { name: /Aplicar no embedding/ }))
    expect(await screen.findByText('Trocar o embedding?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar e reindexar' }))
    await waitFor(() => expect(mocks.applied).toEqual([{ section: 'embedding', source: { provider: 'local', model: 'multilingual-e5-small', dimensions: null } }]))
    mocks.data = { ...mocks.data!, reindexing: true }
    rerender(<OpexAiCard />)
    expect(screen.getByRole('button', { name: /Aplicar no embedding/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/reindexação está em andamento/)).toBeTruthy()
  })

  it('sem nenhum provedor do Opex conectado, o Redator mostra o estado vazio', () => {
    mocks.providers = mocks.providers.map((item) => ({ ...item, connected: false }))
    render(<OpexAiCard />)
    expect(within(screen.getByTestId('redator-source')).getByText(/Nenhum provedor conectado/)).toBeTruthy()
  })
})
