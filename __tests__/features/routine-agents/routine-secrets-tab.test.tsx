/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Aba Segredos do agente rotineiro (critério aprovado OPE-130, D5): lista sem valor, vazio, diálogo com o schema da API e exclusão confirmada. */

const mocks = vi.hoisted(() => ({
  secrets: [] as unknown[],
  save: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/routine-agents/hooks/useRoutineSecrets', () => ({
  useRoutineSecrets: () => ({ data: mocks.secrets, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveRoutineSecret: () => ({ mutate: mocks.save, isPending: false }),
  useDeleteRoutineSecret: () => ({ mutate: mocks.remove, isPending: false }),
}))

import { RoutineSecretsTab } from '@/features/routine-agents/components/page/secrets/RoutineSecretsTab'

const SECRET = { id: 's1', name: 'GUPY_TOKEN', description: 'Token da Gupy', allowedHosts: ['*.gupy.io'], lastUsedAt: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.secrets = []
})
afterEach(() => cleanup())

describe('aba Segredos', () => {
  it('vazio explica o uso e abre o diálogo; o schema da API recusa nome inválido e valor vazio', async () => {
    render(<RoutineSecretsTab agentId="a1" />)
    expect(screen.getByText('Nenhum segredo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Novo segredo' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'token-x' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar segredo/ }))
    await waitFor(() => expect(screen.getByText('Informe o valor')).toBeTruthy())
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('cria com nome em maiúsculas, valor e domínios', async () => {
    render(<RoutineSecretsTab agentId="a1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Novo segredo' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'gupy_token' } })
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: 'segredo' } })
    fireEvent.change(screen.getByLabelText('Domínios permitidos (opcional)'), { target: { value: '*.gupy.io, api.gupy.io' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar segredo/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0]![0]).toEqual({ id: null, input: { name: 'GUPY_TOKEN', description: '', allowedHosts: ['*.gupy.io', 'api.gupy.io'], value: 'segredo' } })
  })

  it('a lista mostra "Valor: definido" (nunca o valor); editar vem com o valor vazio e excluir pede confirmação', async () => {
    mocks.secrets = [SECRET]
    render(<RoutineSecretsTab agentId="a1" />)
    expect(screen.getByText('GUPY_TOKEN')).toBeTruthy()
    expect(screen.getByText('Valor: definido')).toBeTruthy()
    expect(screen.getByText('*.gupy.io')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const value = screen.getByLabelText('Valor novo') as HTMLInputElement
    expect(value.value).toBe('')
    expect(value.getAttribute('placeholder')).toBe('Deixe vazio para manter o valor atual')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: 's1', input: { name: 'GUPY_TOKEN', description: 'Token da Gupy', allowedHosts: ['*.gupy.io'], value: '' } }, expect.anything()))
    cleanup()
    render(<RoutineSecretsTab agentId="a1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(screen.getByText('Excluir o segredo GUPY_TOKEN?')).toBeTruthy()
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
