/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import { apiKeyDto } from '../../helpers/ai-api-keys'

const mocks = vi.hoisted(() => ({
  keys: [] as unknown[],
  activate: vi.fn(),
  update: vi.fn(async () => []),
  remove: vi.fn(),
  create: vi.fn(async () => []),
  toastError: vi.fn(),
}))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))
vi.mock('@/features/ai/hooks/useAiApiKeys', () => ({
  useAiApiKeys: () => ({ data: mocks.keys, isLoading: false, isError: false, refetch: vi.fn() }),
  useAiApiKeysRealtime: () => undefined,
  useActivateAiApiKey: () => ({ mutate: mocks.activate, isPending: false }),
  useUpdateAiApiKey: () => ({ mutateAsync: mocks.update, isPending: false }),
  useRemoveAiApiKey: () => ({ mutate: mocks.remove, isPending: false }),
  useCreateAiApiKey: () => ({ mutateAsync: mocks.create, isPending: false }),
}))

import { ApiKeysCard } from '@/features/ai/components/api-keys/ApiKeysCard'
import { removeApiKeyMessage } from '@/features/ai/components/api-keys/RemoveApiKeyDialog'

const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
const renderCard = () => render(<form onSubmit={submit}><ApiKeysCard provider="gemini" providerName="Gemini" /></form>)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keys = [apiKeyDto('key_aaaaaaaaaaaaaaaaaa', 'Pessoal', true), apiKeyDto('key_bbbbbbbbbbbbbbbbbb', 'Empresa')]
})
afterEach(cleanup)

describe('ApiKeysCard (chaves de API nomeadas, OPE-155)', () => {
  it('lista as chaves com a em uso marcada e ativa outra; nunca mostra segredo', () => {
    renderCard()
    const list = screen.getByRole('list', { name: 'Chaves de API do Gemini' })
    expect(within(list).getByText('Em uso')).toBeTruthy()
    expect(within(list).getAllByText(/Segredo definido/).length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta chave' }))
    expect(mocks.activate).toHaveBeenCalledWith('key_bbbbbbbbbbbbbbbbbb')
  })

  it('remover a em uso com outras chaves avisa para ativar outra antes, sem abrir a confirmação', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Remover Pessoal' }))
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('ative outra chave'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('confirmação da única chave em uso avisa que o provedor fica não configurado', () => {
    expect(removeApiKeyMessage(apiKeyDto('k', 'A', true), 'Gemini')).toContain('"Não configurado"')
    expect(removeApiKeyMessage(apiKeyDto('k', 'A'), 'Gemini')).toContain('Chaves removidas')
  })

  it('renomeia em linha sem formulário aninhado e sem enviar o formulário da página', async () => {
    const { container } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Renomear Empresa' }))
    const input = screen.getByRole('textbox', { name: 'Nome da chave' })
    fireEvent.change(input, { target: { value: 'Empresa X' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 'key_bbbbbbbbbbbbbbbbbb', input: { name: 'Empresa X' } }))
    expect(container.querySelectorAll('form form').length).toBe(0)
    expect(submit).not.toHaveBeenCalled()
  })

  it('sem chaves mostra o vazio com a ação de adicionar', () => {
    mocks.keys = []
    renderCard()
    expect(screen.getByText('Nenhuma chave de API')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Adicionar chave' }).length).toBe(2)
  })
})
