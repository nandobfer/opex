/** @vitest-environment happy-dom */

import React from 'react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { ApiTokenDto, ApiTokenScopeCatalogDto } from '@/features/integrations/api-tokens/types'

/**
 * Tela de tokens de sistema (OPE-102): formulário de escopos (API, MCP do dono, ferramentas,
 * destrutivas), resumo antes de confirmar, edição e a lista com badges, skeleton, vazio e erro.
 */

const mocks = vi.hoisted(() => ({
  tokens: { data: [] as unknown[] | undefined, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  scopes: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  create: vi.fn(),
  update: vi.fn(),
  revoke: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/integrations/hooks/useApiTokens', () => ({
  useApiTokens: () => mocks.tokens,
  useApiTokenScopes: () => mocks.scopes,
  useApiTokensRealtime: () => {},
  useCreateApiToken: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateApiToken: () => ({ mutateAsync: mocks.update, isPending: false }),
  useRevokeApiToken: () => ({ mutate: mocks.revoke, isPending: false }),
}))

import { ApiTokensCard } from '@/features/integrations/components/internal-api/ApiTokensCard'
import { ApiTokenDialog } from '@/features/integrations/components/internal-api/ApiTokenDialog'

const catalog: ApiTokenScopeCatalogDto = {
  routes: [{ method: 'GET', path: '/api/v1/whoami', scope: null, summary: 'Confere o token' }],
  groups: [
    { id: 'context', label: 'Contexto', description: '' },
    { id: 'tasks', label: 'Tarefas', description: '' },
  ],
  tools: [
    { name: 'get_app_overview', group: 'context', label: 'Visão geral', description: 'Visão', risk: 'read', alwaysOn: true },
    { name: 'list_tasks', group: 'tasks', label: 'Listar tarefas', description: 'Lista', risk: 'read', alwaysOn: false },
    { name: 'delete_task', group: 'tasks', label: 'Excluir tarefa', description: 'Exclui', risk: 'destructive', alwaysOn: false },
  ],
}

const token = (over: Partial<ApiTokenDto> = {}): ApiTokenDto => ({
  id: 't1',
  nome: 'Automação',
  prefixo: 'mt_sys_AbCdEfGh',
  criadoEm: '2026-01-01T00:00:00.000Z',
  ultimoUsoEm: null,
  escopos: ['mcp:owner', 'mcp:owner:tool:*'],
  legado: false,
  expiraEm: null,
  expirado: false,
  ...over,
})

const clickSwitch = (id: string) => fireEvent.click(document.getElementById(id)!)
const typeName = (value: string) => fireEvent.change(screen.getByLabelText('Nome (quem vai usar)'), { target: { value } })
const review = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tokens = { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }
  mocks.scopes = { data: catalog, isLoading: false, isError: false, error: null, refetch: vi.fn() }
})

describe('ApiTokenDialog (gerar)', () => {
  it('sem escopo não avança; com API v1 mostra o resumo e gera com os escopos escolhidos', async () => {
    mocks.create.mockResolvedValue({ token: 'mt_sys_valor_unico', item: token() })
    render(<ApiTokenDialog open onOpenChange={() => {}} />)
    typeName('Script de relatórios')
    await review()
    expect(await screen.findByText('Escolha pelo menos um escopo')).toBeTruthy()
    expect(screen.queryByTestId('api-token-summary')).toBeNull()

    fireEvent.click(document.getElementById('scope-api-all')!)
    await review()
    const summary = await screen.findByTestId('api-token-summary')
    expect(within(summary).getByText('API v1')).toBeTruthy()
    expect(summary.textContent).toContain('Não expira')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gerar token' }))
    })
    expect(mocks.create).toHaveBeenCalledWith({ nome: 'Script de relatórios', escopos: ['api:v1:*'], expiraEm: null })
    expect(await screen.findByText('mt_sys_valor_unico')).toBeTruthy()
  })

  it('MCP do dono: "Todas" grava o curinga, avisa destrutivas recusadas e destaca quando liberadas', async () => {
    mocks.create.mockResolvedValue({ token: 'mt_sys_x', item: token() })
    render(<ApiTokenDialog open onOpenChange={() => {}} />)
    typeName('Agente externo')
    clickSwitch('scope-mcp-owner')
    expect(screen.getByTestId('destructive-blocked').textContent).toContain('Excluir tarefa')
    expect(screen.queryByTestId('destructive-allowed')).toBeNull()

    clickSwitch('scope-mcp-destructive')
    expect(screen.getByTestId('destructive-allowed').textContent).toContain('Excluir tarefa')
    expect(screen.queryByTestId('destructive-blocked')).toBeNull()

    await review()
    const summary = await screen.findByTestId('api-token-summary')
    expect(within(summary).getByText('Destrutivas')).toBeTruthy()
    expect(within(summary).getByText('MCP · 3 ferramentas')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gerar token' }))
    })
    expect(mocks.create.mock.calls[0][0].escopos).toEqual(['mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:destructive'])
  })

  it('lista explícita com "Selecionar tudo" e busca; Contexto fica sempre liberado', async () => {
    mocks.create.mockResolvedValue({ token: 'mt_sys_x', item: token() })
    render(<ApiTokenDialog open onOpenChange={() => {}} />)
    typeName('Lista')
    clickSwitch('scope-mcp-owner')
    fireEvent.click(screen.getByRole('radio', { name: /Lista explícita/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar tudo' }))
    fireEvent.change(screen.getByPlaceholderText('Buscar ferramenta...'), { target: { value: 'excluir' } })
    expect(screen.getByText('Excluir tarefa')).toBeTruthy()
    expect(document.querySelector('[data-sensitive="true"]')?.textContent).toContain('Destrutiva')
    fireEvent.change(screen.getByPlaceholderText('Buscar ferramenta...'), { target: { value: 'visão' } })
    expect(screen.getByText('Sempre liberada')).toBeTruthy()
    await review()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gerar token' }))
    })
    expect(mocks.create.mock.calls[0][0].escopos).toEqual(['mcp:owner', 'mcp:owner:tool:list_tasks', 'mcp:owner:tool:delete_task'])
  })

  it('Voltar do resumo preserva a seleção', async () => {
    render(<ApiTokenDialog open onOpenChange={() => {}} />)
    typeName('Volta')
    fireEvent.click(document.getElementById('scope-api-all')!)
    await review()
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect((document.getElementById('scope-api-all') as HTMLInputElement).checked).toBe(true)
  })

  it('carregando mostra o skeleton; erro do catálogo tem "Tentar novamente"', () => {
    mocks.scopes = { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() }
    const { unmount } = render(<ApiTokenDialog open onOpenChange={() => {}} />)
    expect(screen.getByTestId('api-token-dialog-loading')).toBeTruthy()
    unmount()
    const refetch = vi.fn()
    mocks.scopes = { data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch }
    render(<ApiTokenDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(refetch).toHaveBeenCalled()
  })
})

describe('ApiTokenDialog (editar)', () => {
  it('vem com os escopos do token, sem o campo nome, e salva escopos e expiração', async () => {
    mocks.update.mockResolvedValue(token())
    const onOpenChange = vi.fn()
    render(<ApiTokenDialog open onOpenChange={onOpenChange} token={token({ escopos: ['mcp:owner', 'mcp:owner:group:tasks'] })} />)
    expect(screen.queryByLabelText('Nome (quem vai usar)')).toBeNull()
    expect((document.getElementById('scope-mcp-owner') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('radio', { name: /Grupos inteiros/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(document.getElementById('scope-api-all')!)
    await review()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Salvar escopos' }))
    })
    expect(mocks.update).toHaveBeenCalledWith({ id: 't1', input: { escopos: ['api:v1:*', 'mcp:owner', 'mcp:owner:group:tasks'], expiraEm: null } })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})

describe('ApiTokensCard', () => {
  it('lista com badges de escopo, legado e expirado; editar e revogar com confirmação', async () => {
    mocks.tokens.data = [
      token(),
      token({ id: 't2', nome: 'Antigo', escopos: [], legado: true }),
      token({ id: 't3', nome: 'Vencido', escopos: ['api:v1:*'], expiraEm: '2020-01-01T00:00:00.000Z', expirado: true }),
    ]
    render(<ApiTokensCard />)
    const first = screen.getByTestId('api-token-t1')
    expect(within(first).getByText('MCP · 2 ferramentas')).toBeTruthy()
    expect(within(screen.getByTestId('api-token-t2')).getByText('Legado · só whoami')).toBeTruthy()
    expect(within(screen.getByTestId('api-token-t3')).getByText('Expirado')).toBeTruthy()

    fireEvent.click(within(screen.getByTestId('api-token-t2')).getByRole('button', { name: 'Revogar' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm.textContent).toContain('Revogar o token “Antigo”?')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revogar' }))
    expect(mocks.revoke).toHaveBeenCalledWith('t2')

    fireEvent.click(within(first).getByRole('button', { name: 'Editar escopos' }))
    expect(await screen.findByText('Escopos do token “Automação”')).toBeTruthy()
  })

  it('skeleton com a estrutura da linha, vazio e erro com tentar novamente', () => {
    mocks.tokens = { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() }
    const { unmount } = render(<ApiTokensCard />)
    expect(screen.getByTestId('api-tokens-skeleton').querySelectorAll('li')).toHaveLength(2)
    unmount()
    mocks.tokens = { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }
    const empty = render(<ApiTokensCard />)
    expect(screen.getByText(/Nenhum token de sistema/)).toBeTruthy()
    empty.unmount()
    const refetch = vi.fn()
    mocks.tokens = { data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch }
    render(<ApiTokensCard />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(refetch).toHaveBeenCalled()
  })
})

describe('controles do design system', () => {
  it('a pasta da tela não usa <select>, checkbox nativo nem primitivos Radix sem tema', () => {
    const dir = join(process.cwd(), 'src/features/integrations/components/internal-api')
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.tsx'))) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source, file).not.toMatch(/<select\b/)
      expect(source, file).not.toMatch(/type=["']checkbox["']/)
      expect(source, file).not.toMatch(/@radix-ui\//)
    }
  })
})
