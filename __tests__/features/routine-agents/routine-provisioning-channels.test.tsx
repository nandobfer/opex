/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Card Provisionamento (OPE-143): Remover por extra (com confirmação), canais bloqueados e o campo "Bloquear canal". */

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  provisioning: vi.fn(),
  channels: [] as { slug: string; name: string; archived_at: string | null }[],
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/routine-agents/hooks/useRoutineAgents', () => ({
  useRoutineProvisioning: () => ({ mutate: mocks.provisioning, isPending: false }),
  useRoutineChannelAction: () => ({ mutate: mocks.action, isPending: false }),
}))
vi.mock('@/features/engramind/hooks/useEngramind', () => ({ useEngramindList: () => ({ items: mocks.channels, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({ options, value, onValueChange, placeholder }: { options: { value: string }[]; value?: string; onValueChange?: (value: string) => void; placeholder?: string }) => (
    <select aria-label={placeholder} value={value ?? ''} onChange={(event) => onValueChange?.(event.target.value)}>
      <option value="">—</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.value}
        </option>
      ))}
    </select>
  ),
}))

import { RoutineProvisioningPanel } from '@/features/routine-agents/components/editor/RoutineProvisioningPanel'
import type { RoutineAgentDto } from '@/features/routine-agents/types'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'

const agent = (overrides: Partial<RoutineAgentDto['provisioning']> = {}): RoutineAgentDto => ({
  id: 'a'.repeat(24),
  name: 'Garimpeiro',
  title: 'Agente Garimpeiro',
  generated: { name: false, objective: false },
  slug: 'garimpeiro',
  objective: 'Achar vagas',
  instructions: '',
  engine: 'opex',
  opex: { provider: 'anthropic', model: 'claude', variant: null, enabledTools: [], enabledMcpServers: [] },
  opencode: { model: '', variant: null, agent: null, enabledMcps: [] },
  confirmIrreversible: true,
  limits: EMPTY_ROUTINE_LIMITS,
  triggers: [],
  schedule: [],
  status: 'active',
  provisioning: {
    status: 'ok',
    error: null,
    at: null,
    channels: ['opex', 'agentes/rotineiros/global', 'agentes/rotineiros/garimpeiro'],
    extras: [{ channel: 'vagas/empresa-x', name: 'Vagas X', reason: 'vagas da empresa', created: false }],
    blocked: [{ channel: 'experiencia/desenvolvimento', name: 'Experiência', at: '2026-11-06T10:00:00.000Z' }],
    warnings: [],
    steps: { agent: true, token: true, channels: true, extras: true, workdir: true },
    ...overrides,
  },
  webhookEnabled: false,
  workdir: null,
  engramindAgent: 'opex/rotineiro-garimpeiro',
  channel: 'agentes/rotineiros/garimpeiro',
  lastRun: null,
  nextFireAt: null,
  activeRuns: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.channels = [
    { slug: 'opex', name: 'Opex', archived_at: null },
    { slug: 'vagas/empresa-x', name: 'Vagas X', archived_at: null },
    { slug: 'experiencia/desenvolvimento', name: 'Experiência', archived_at: null },
    { slug: 'dndicas/opex/admin', name: 'Admin', archived_at: null },
    { slug: 'antigo/arquivado', name: 'Arquivado', archived_at: '2026-01-01T00:00:00.000Z' },
    { slug: 'agentes/desenvolvedor/global', name: 'Dev', archived_at: null },
  ]
})
afterEach(() => cleanup())

describe('canais extras do Provisionamento', () => {
  it('só os extras têm "Remover" (os base são só etiquetas) e a ação pede confirmação antes de chamar', () => {
    render(<RoutineProvisioningPanel agent={agent()} />)
    const remove = screen.getAllByRole('button', { name: /Remover o canal/ })
    expect(remove).toHaveLength(1)
    expect(remove[0]!.getAttribute('aria-label')).toBe('Remover o canal vagas/empresa-x')

    fireEvent.click(remove[0]!)
    expect(mocks.action).not.toHaveBeenCalled()
    expect(screen.getByText(/A assinatura do agente é cancelada no Engramind/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remover canal' }))
    expect(mocks.action).toHaveBeenCalledWith({ id: 'a'.repeat(24), action: 'block', channel: 'vagas/empresa-x' }, expect.anything())
  })

  it('o bloqueado mostra "Assinar de novo" (com confirmação) e "Desbloquear"', () => {
    render(<RoutineProvisioningPanel agent={agent()} />)
    expect(screen.getByText('experiencia/desenvolvimento')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Desbloquear/ }))
    expect(mocks.action).toHaveBeenCalledWith({ id: 'a'.repeat(24), action: 'unblock', channel: 'experiencia/desenvolvimento' }, expect.anything())

    fireEvent.click(screen.getByRole('button', { name: /Assinar de novo/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Assinar de novo' }).at(-1)!)
    expect(mocks.action).toHaveBeenLastCalledWith({ id: 'a'.repeat(24), action: 'resubscribe', channel: 'experiencia/desenvolvimento' }, expect.anything())
  })

  it('o campo "Bloquear canal" não oferece base, extras, bloqueados, arquivados nem canais de outros agentes', () => {
    render(<RoutineProvisioningPanel agent={agent()} />)
    const select = screen.getByLabelText('Bloquear canal…') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'dndicas/opex/admin'])

    fireEvent.change(select, { target: { value: 'dndicas/opex/admin' } })
    fireEvent.click(screen.getByRole('button', { name: /^Bloquear$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear canal' }))
    expect(mocks.action).toHaveBeenCalledWith({ id: 'a'.repeat(24), action: 'block', channel: 'dndicas/opex/admin' }, expect.anything())
  })

  it('sem bloqueados mostra o vazio; durante o provisionamento as ações ficam desabilitadas', () => {
    const { rerender } = render(<RoutineProvisioningPanel agent={agent({ blocked: [] })} />)
    expect(screen.getByText(/Nenhum\. O provisionamento pode propor/)).toBeTruthy()
    rerender(<RoutineProvisioningPanel agent={agent({ status: 'running' })} />)
    expect((screen.getByRole('button', { name: /Remover o canal/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Desbloquear/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
