/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from "../../helpers/framer-motion"
import { apiKeyDto } from "../../helpers/ai-api-keys"

const mocks = vi.hoisted(() => ({
  keys: [] as unknown[],
  toggle: vi.fn(),
  primary: vi.fn(),
  update: vi.fn(async () => []),
  remove: vi.fn(),
  create: vi.fn(async () => []),
  billing: vi.fn(async () => []),
  toastError: vi.fn(),
}))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAiApiKeys', () => ({
  useAiApiKeys: () => ({ data: mocks.keys, isLoading: false, isError: false, refetch: vi.fn() }),
  useAiApiKeysRealtime: () => undefined,
  useToggleAiApiKey: () => ({ mutate: mocks.toggle, isPending: false }),
  useMakePrimaryAiApiKey: () => ({ mutate: mocks.primary, isPending: false }),
  useUpdateAiApiKey: () => ({ mutateAsync: mocks.update, isPending: false }),
  useRemoveAiApiKey: () => ({ mutate: mocks.remove, isPending: false }),
  useCreateAiApiKey: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateAiKeyBilling: () => ({ mutateAsync: mocks.billing, isPending: false }),
}))

import { ApiKeysCard } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/components/api-keys/ApiKeysCard"
import { removeApiKeyMessage } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/components/api-keys/RemoveApiKeyDialog"

const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
const renderCard = (provider: 'gemini' | 'jev' = 'gemini', name = 'Gemini') => render(<form onSubmit={submit}><ApiKeysCard provider={provider} providerName={name} /></form>)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keys = [apiKeyDto('key_aaaaaaaaaaaaaaaaaa', 'Pessoal', true), apiKeyDto('key_bbbbbbbbbbbbbbbbbb', 'Empresa')]
})
afterEach(cleanup)

describe('ApiKeysCard (chaves de API nomeadas, OPE-155/OPE-179)', () => {
  it('lista as chaves com a principal marcada; clicar põe outra em uso; nunca mostra segredo', () => {
    renderCard()
    const list = screen.getByRole('list', { name: 'Chaves de API do Gemini' })
    expect(within(list).getByText('Em uso')).toBeTruthy()
    expect(within(list).getByText('Principal')).toBeTruthy()
    expect(within(list).getAllByText(/Segredo definido/).length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Usar a chave Empresa' }))
    expect(mocks.toggle).toHaveBeenCalledWith({ id: 'key_bbbbbbbbbbbbbbbbbb', selected: true })
  })

  it('chave em uso que não é a principal sai de uso pelo clique; a principal avisa a regra e não sai', () => {
    mocks.keys = [apiKeyDto('key_aaaaaaaaaaaaaaaaaa', 'Pessoal', true), apiKeyDto('key_bbbbbbbbbbbbbbbbbb', 'Empresa', true, false)]
    renderCard()
    expect(screen.getAllByText('Em uso').length).toBe(2)
    const empresa = screen.getByRole('button', { name: 'Tirar a chave Empresa de uso' })
    expect(empresa.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(empresa)
    expect(mocks.toggle).toHaveBeenCalledWith({ id: 'key_bbbbbbbbbbbbbbbbbb', selected: false })

    fireEvent.click(screen.getByRole('button', { name: 'Tirar a chave Pessoal de uso' }))
    expect(mocks.toggle).toHaveBeenCalledOnce()
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('torne outra chave principal antes de tirá-la de uso'))
  })

  it('"Tornar principal" só aparece nas outras chaves', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: 'Tornar Pessoal a chave principal' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tornar Empresa a chave principal' }))
    expect(mocks.primary).toHaveBeenCalledWith('key_bbbbbbbbbbbbbbbbbb')
  })

  it('remover a principal com outras chaves avisa para tornar outra principal antes, sem abrir a confirmação', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Remover Pessoal' }))
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('torne outra chave principal antes de removê-la'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('avisa que o Engramind recebe só a principal nos provedores que o alimentam (não no JEV)', () => {
    const { container, unmount } = renderCard()
    expect(container.querySelector('[data-slot="engramind-note"]')?.textContent).toContain('chave principal')
    unmount()
    const jev = renderCard('jev', 'JEV')
    expect(jev.container.querySelector('[data-slot="engramind-note"]')).toBeNull()
  })

  it('confirmação: a principal única deixa o provedor não configurado; outra em uso sai do rodízio', () => {
    expect(removeApiKeyMessage(apiKeyDto('k', 'A', true), 'Gemini')).toContain('"Não configurado"')
    expect(removeApiKeyMessage(apiKeyDto('k', 'A', true, false), 'Gemini')).toContain('sai do rodízio')
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

  it('OPE-203: mostra o plano de cobrança e os avisos de cada chave e abre o plano pelo botão; o JEV não tem plano', () => {
    mocks.keys = [
      apiKeyDto('key_aaaaaaaaaaaaaaaaaa', 'Pessoal', true, true, { billing: { mode: 'subscription', amount: 10, currency: 'USD', renewalDay: 5, iofPercent: 6.38 }, billingNotices: ['Ciclo atual (desde 05/11): 2 dia(s) sem uso'] }),
      apiKeyDto('key_bbbbbbbbbbbbbbbbbb', 'Empresa'),
    ]
    renderCard()
    const summaries = screen.getAllByText(/Assinatura de|Pago por uso/)
    expect(summaries.map((node) => node.textContent)).toEqual([expect.stringContaining('renova dia 5'), 'Pago por uso'])
    expect(screen.getByText(/2 dia\(s\) sem uso/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Plano de cobrança de Pessoal' }))
    expect(screen.getByText('Plano de cobrança — Pessoal')).toBeTruthy()
    cleanup()
    renderCard('jev', 'JEV')
    expect(screen.queryByRole('button', { name: /Plano de cobrança/ })).toBeNull()
  })
})
