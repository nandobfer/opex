/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { OpexMcpServerDto } from '@/features/opex-agent/mcp'

const mocks = vi.hoisted(() => ({
  state: { isLoading: false, isError: false, data: [] as unknown[] },
  refetch: vi.fn(),
  toggle: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  test: vi.fn(),
  testData: undefined as unknown,
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/opex-agent/hooks/useOpexMcpServers', () => ({
  useOpexMcpServers: () => ({ ...mocks.state, error: null, refetch: mocks.refetch }),
  useOpexMcpRealtime: () => {},
  useToggleOpexMcpServer: () => ({ mutate: mocks.toggle }),
  useDeleteOpexMcpServer: () => ({ mutate: mocks.remove, isPending: false }),
  useSaveOpexMcpServer: () => ({ mutateAsync: mocks.save, isPending: false }),
  useTestOpexMcpServer: () => ({ mutateAsync: mocks.test, isPending: false, data: mocks.testData }),
}))

import { OpexMcpSection } from '@/features/opex-agent/components/settings/mcp/OpexMcpSection'
import { ClienteOpexMcpCard } from '@/features/opex-agent/components/settings/client/ClienteOpexMcpCard'

const SERVER: OpexMcpServerDto = {
  id: 'a'.repeat(24),
  name: 'GitHub',
  slug: 'github',
  description: 'Issues e PRs',
  enabled: true,
  transport: 'http',
  url: 'https://mcp.example.com/mcp?token=abc',
  command: '',
  args: [],
  headers: [{ key: 'Authorization', configured: true }],
  env: [],
  confirmations: {},
  tools: [
    { name: 'search', title: 'Buscar', description: 'Busca issues', annotations: { readOnlyHint: true } },
    { name: 'create_issue', title: null, description: 'Cria issue', annotations: {} },
  ],
  toolsSyncedAt: null,
  lastError: null,
  lastCheckedAt: null,
  clientCount: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = { isLoading: false, isError: false, data: [SERVER] }
  mocks.testData = undefined
  mocks.save.mockResolvedValue(SERVER)
})
afterEach(cleanup)

describe('seção MCPs do Agente Opex', () => {
  it('lista os MCPs com transporte, endereço sem a query, clientes e falha da última conexão', () => {
    mocks.state.data = [{ ...SERVER, lastError: 'Sem resposta em 10 s' }]
    render(<OpexMcpSection />)
    expect(screen.getByText('GitHub')).toBeTruthy()
    expect(screen.getByText('HTTP')).toBeTruthy()
    expect(screen.getByText('https://mcp.example.com/mcp')).toBeTruthy()
    expect(screen.getByText(/2 clientes/)).toBeTruthy()
    expect(screen.getByText(/Falha na última conexão: Sem resposta em 10 s/)).toBeTruthy()
  })

  it('estado vazio com ação de cadastrar e erro com tentar novamente', () => {
    mocks.state.data = []
    render(<OpexMcpSection />)
    expect(screen.getByText('Nenhum MCP cadastrado')).toBeTruthy()
    cleanup()
    mocks.state = { isLoading: false, isError: true, data: [] }
    render(<OpexMcpSection />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('habilitar/desabilitar sem excluir', () => {
    render(<OpexMcpSection />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'GitHub: habilitado' }))
    expect(mocks.toggle).toHaveBeenCalledWith({ id: SERVER.id, enabled: false })
  })

  it('excluir pede confirmação explícita', () => {
    render(<OpexMcpSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(screen.getByText('Excluir o MCP GitHub?')).toBeTruthy()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('editar mostra o header salvo sem o valor, ajusta a confirmação por ferramenta e salva mantendo o segredo', async () => {
    render(<OpexMcpSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByText('Editar MCP GitHub')).toBeTruthy()
    expect(screen.getByText('Configurado')).toBeTruthy()
    // O valor salvo nunca volta: nenhum campo de senha aberto até clicar em Substituir.
    expect(document.querySelectorAll('input[type="password"]').length).toBe(0)
    expect(screen.getByRole('button', { name: 'Substituir' })).toBeTruthy()
    // Leitura não pede confirmação; sem anotação (destrutiva), pede.
    const search = screen.getByRole('checkbox', { name: 'Buscar: pede confirmação' })
    expect((search as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: 'create_issue: pede confirmação' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('mcp_github_search')).toBeTruthy()
    fireEvent.click(search)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    const { id, input } = mocks.save.mock.calls[0]![0] as { id: string; input: { headers: unknown; confirmations: unknown } }
    expect(id).toBe(SERVER.id)
    expect(input.headers).toEqual([{ key: 'Authorization', value: '' }])
    expect(input.confirmations).toEqual({ search: true })
    // Regressão: sem "Testar conexão", o retrato das ferramentas não vai no PUT.
    expect('tools' in input).toBe(false)
  })

  it('editar depois de testar a conexão envia o retrato novo das ferramentas', async () => {
    const tools = [{ name: 'ping', title: null, description: '', annotations: { readOnlyHint: true } }]
    mocks.test.mockResolvedValue({ ok: true, tools, error: null, durationMs: 100, serverInfo: null })
    render(<OpexMcpSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/ }))
    await waitFor(() => expect(screen.getByText('mcp_github_ping')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect((mocks.save.mock.calls[0]![0] as { input: { tools?: unknown } }).input.tools).toEqual(tools)
  })

  it('regressão: header vazio deixado no HTTP não bloqueia salvar depois de trocar para stdio', async () => {
    render(<OpexMcpSection />)
    fireEvent.click(screen.getAllByRole('button', { name: /Cadastrar MCP/ })[0]!)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Local' } })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar header/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'stdio' }))
    fireEvent.change(screen.getByLabelText('Comando'), { target: { value: 'npx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect((mocks.save.mock.calls[0]![0] as { input: { transport: string } }).input.transport).toBe('stdio')
  })

  it('cadastrar: identificador sugerido pelo nome, aviso do stdio e testar conexão envia o rascunho', async () => {
    mocks.test.mockResolvedValue({ ok: true, tools: [{ name: 'ping', title: null, description: '', annotations: { readOnlyHint: true } }], error: null, durationMs: 300, serverInfo: 'x' })
    render(<OpexMcpSection />)
    fireEvent.click(screen.getAllByRole('button', { name: /Cadastrar MCP/ })[0]!)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Meu Servidor' } })
    await waitFor(() => expect((screen.getByLabelText('Identificador') as HTMLInputElement).value).toBe('meu_servidor'))
    fireEvent.click(screen.getByRole('radio', { name: 'stdio' }))
    expect(screen.getByText(/O processo roda dentro do servidor do Opex/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Comando'), { target: { value: 'npx' } })
    fireEvent.change(screen.getByLabelText('Argumentos (um por linha)'), { target: { value: '-y\npacote' } })
    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/ }))
    await waitFor(() => expect(mocks.test).toHaveBeenCalledWith(expect.objectContaining({ transport: 'stdio', command: 'npx', args: ['-y', 'pacote'] })))
    await waitFor(() => expect(screen.getByText('mcp_meu_servidor_ping')).toBeTruthy())
  })
})

describe('MCPs na aba do Agente Opex do cliente', () => {
  it('liga um MCP para o cliente e mostra o aviso de credenciais', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ClienteOpexMcpCard value={[]} onChange={onChange} />)
    expect(screen.queryByText(/acessam o sistema externo/)).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'GitHub: liberado para o cliente' }))
    expect(onChange).toHaveBeenCalledWith([SERVER.id])
    rerender(<ClienteOpexMcpCard value={[SERVER.id]} onChange={onChange} />)
    expect(screen.getByText(/acessam o sistema externo/)).toBeTruthy()
  })

  it('MCP desabilitado no agente aparece marcado', () => {
    mocks.state.data = [{ ...SERVER, enabled: false }]
    render(<ClienteOpexMcpCard value={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Desabilitado no agente')).toBeTruthy()
  })
})
