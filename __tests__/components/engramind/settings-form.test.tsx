/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/** OPE-117: formulário de Configurações do Engramind (agendamento, controles por tipo, filtros) e o "Executar agora" das seções. */

const mocks = vi.hoisted(() => ({
  send: vi.fn(async (_method: string, _path: string, _body?: unknown): Promise<unknown> => ({ dry_run: false, channels: [], jobs: [{ channel: 'eng/global', job_id: 7, already_queued: true }] })),
  status: { embedding: { state: 'ready', done: 0, total: 0 }, retention: null as null | { last_run_at: string; removed: Record<string, number> }, consolidation: { next_run_at: '2026-11-04T03:00:00Z' } },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/features/engramind/hooks/useEngramind', async (original) => {
  const { useState } = await import('react')
  return {
    ...(await original<object>()),
    engramindSend: (method: string, path: string, body?: unknown) => mocks.send(method, path, body),
    useEngramindQuery: () => ({ data: mocks.status, isLoading: false }),
    useEngramindList: () => ({ items: [{ slug: 'eng/global', archived_at: null }, { slug: 'eng/velho', archived_at: '2026-01-01' }], isLoading: false }),
    useEngramindMutation: (request: (variables: unknown) => Promise<unknown>) => {
      const [state, setState] = useState<{ isPending: boolean; variables: unknown }>({ isPending: false, variables: undefined })
      return {
        ...state,
        mutate: (variables: unknown) => void request(variables),
        mutateAsync: async (variables: unknown) => {
          setState({ isPending: true, variables })
          try {
            return await request(variables)
          } finally {
            setState({ isPending: false, variables })
          }
        },
      }
    },
  }
})

import { SettingField } from '@/features/engramind/components/integration/settings/SettingField'
import { filterSettingMetas } from '@/features/engramind/components/integration/settings/SettingsFilters'
import { ConsolidationActions, RetentionInfo } from '@/features/engramind/components/integration/settings/SectionActions'
import { RunNowButton } from '@/components/ui/run-now-button'
import type { SettingMeta } from '@/features/engramind/types'

const cronMeta = { key: 'consolidation.schedule', type: 'cron', default: '0 3 * * *', description: '' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.status.retention = null
})
afterEach(cleanup)

describe('agendamento da consolidação', () => {
  it('abre no editor das Rotinas em horário de Brasília e grava o cron UTC', async () => {
    const onChange = vi.fn()
    render(<SettingField meta={cronMeta} value={null} dirty={false} onChange={onChange} nextRunAt="2026-11-04T03:00:00Z" />)
    expect(screen.getByTestId('schedule-row')).toBeTruthy()
    expect(screen.getByText(/horário de Brasília/)).toBeTruthy()
    expect(screen.getByText(/Próxima execução/)).toBeTruthy()
    expect(screen.queryByLabelText('Expressão cron (UTC)')).toBeNull()
  })

  it('cron fora do editor abre direto no modo avançado, com validação inline de 5 campos', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SettingField meta={cronMeta} value="0 3 1-15 * *" dirty onChange={onChange} />)
    const input = screen.getByLabelText('Expressão cron (UTC)') as HTMLInputElement
    expect(input.value).toBe('0 3 1-15 * *')
    fireEvent.change(input, { target: { value: '@daily' } })
    expect(onChange).toHaveBeenCalledWith('@daily')
    rerender(<SettingField meta={cronMeta} value="@daily" dirty onChange={onChange} />)
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Apelidos'))).toBe(true)
  })

  it('troca entre "Agendamento" e "Expressão cron" pelas abas', () => {
    render(<SettingField meta={cronMeta} value="30 1 * * *" dirty={false} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Expressão cron' }))
    expect((screen.getByLabelText('Expressão cron (UTC)') as HTMLInputElement).value).toBe('30 1 * * *')
    fireEvent.click(screen.getByRole('radio', { name: 'Agendamento' }))
    expect(screen.getByTestId('schedule-row')).toBeTruthy()
  })
})

describe('agendamento controlado pelo rascunho (OPE-117)', () => {
  /** Simula o formulário: o valor vem do rascunho; "trocar por fora" é o "Voltar ao padrão"/"Desfazer". */
  function Controlled({ initial, external }: { initial: string; external: { set?: (value: string | null) => void } }) {
    const [value, setValue] = React.useState<string | null>(initial)
    external.set = setValue
    return <SettingField meta={cronMeta} value={value} dirty={value !== null} onChange={(next) => setValue(next as string | null)} />
  }

  it('mensal no dia 31 emite o marcador e mostra a mensagem; voltar o valor por fora traz o editor ao horário dele', async () => {
    const external: { set?: (value: string | null) => void } = {}
    render(<Controlled initial="0 13 5 * *" external={external} />)
    fireEvent.change(screen.getByLabelText('Dia do mês'), { target: { value: '31' } })
    expect(screen.getAllByText(/Mensal só até o dia 28/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('radio', { name: 'Expressão cron' }))
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Mensal só até o dia 28'))).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Agendamento' }))
    React.act(() => external.set!(null))
    expect(screen.getAllByLabelText('Horário')[0]!.textContent).toContain('00:00')
    expect(screen.queryByLabelText('Dia do mês')).toBeNull()
  })
})

describe('controles por tipo', () => {
  it('prioridade por categoria (map): número por categoria, vazio sai do mapa e "por canal" quando sobrepõe', () => {
    const onChange = vi.fn()
    render(<SettingField meta={{ key: 'context.category_priorities', type: 'map', default: {}, description: '', channel_override: true }} value={{ NAMING: 5 }} dirty onChange={onChange} categories={[{ key: 'PROJECT_RULES', label: 'Regras' }, { key: 'NAMING', label: 'Nomes' }]} />)
    expect(screen.getByTestId('channel-override')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('PROJECT_RULES'), { target: { value: '30' } })
    expect(onChange).toHaveBeenLastCalledWith({ NAMING: 5, PROJECT_RULES: 30 })
    fireEvent.change(screen.getByLabelText('NAMING'), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({})
  })

  it('lista de opções (consolidation.tasks) vira chaves por opção, sem texto livre', () => {
    const onChange = vi.fn()
    render(<SettingField meta={{ key: 'consolidation.tasks', type: 'list', choices: ['duplicates', 'importance', 'stale'], default: ['duplicates'], description: '' }} value={['duplicates']} dirty={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'stale' }))
    expect(onChange).toHaveBeenLastCalledWith(['duplicates', 'stale'])
  })

  it('número fracionário de 0 a 1 usa passo 0,01', () => {
    render(<SettingField meta={{ key: 'context.focus_min_score', type: 'number', min: 0, max: 1, default: 0.5, description: '' }} value={null} dirty={false} onChange={vi.fn()} />)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).getAttribute('step')).toBe('0.01')
  })
})

describe('busca e "Só alteradas"', () => {
  const metas = [
    { key: 'limits.rate_per_minute', type: 'integer', value: 600, default: 600, description: '', channel_override: false, updated_at: null },
    { key: 'consolidation.schedule', type: 'cron', value: '0 4 * * *', default: '0 3 * * *', description: '', channel_override: false, updated_at: '2026-11-01T00:00:00Z' },
    { key: 'memory.text_max', type: 'integer', value: 4000, default: 4000, description: '', channel_override: true, updated_at: null },
  ] as unknown as SettingMeta[]

  it('"Só alteradas" mostra as salvas fora do padrão e as do rascunho', () => {
    expect(filterSettingMetas(metas, { term: '', onlyChanged: true, draft: {} }).map((meta) => meta.key)).toEqual(['consolidation.schedule'])
    expect(filterSettingMetas(metas, { term: '', onlyChanged: true, draft: { 'memory.text_max': 5000 } }).map((meta) => meta.key)).toEqual(['consolidation.schedule', 'memory.text_max'])
  })

  it('busca tolerante por chave, rótulo e ajuda', () => {
    expect(filterSettingMetas(metas, { term: 'agendamento', onlyChanged: false, draft: {} }).map((meta) => meta.key)).toEqual(['consolidation.schedule'])
    expect(filterSettingMetas(metas, { term: 'rate_per', onlyChanged: false, draft: {} }).map((meta) => meta.key)).toEqual(['limits.rate_per_minute'])
  })
})

describe('"Executar agora" das seções', () => {
  it('consolidação de todos os canais: confirma com o escopo e mostra os jobs (already_queued)', async () => {
    render(<ConsolidationActions dirty={false} saveDraft={vi.fn(async () => true)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Executar agora: Consolidação' }))
    expect(screen.getByText(/todos os canais com consolidação ativa/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Executar agora' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('post', 'consolidation/run', {}))
    expect((await screen.findByTestId('consolidation-result')).textContent).toContain('já estava na fila')
  })

  it('"Ver plano" manda dry_run do canal escolhido e não grava (mostra o plano)', async () => {
    mocks.send.mockResolvedValueOnce({ dry_run: true, channels: [{ channel: 'eng/global', skipped: {}, duplicates: [{ keep: 'm_1', archive: 'm_2' }], classify: [], stale: { flag: [], clear: [], archive: [] } }], jobs: [] })
    render(<ConsolidationActions dirty={false} saveDraft={vi.fn(async () => true)} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Um canal' }))
    expect(screen.getAllByTestId('run-now-blocked')).toHaveLength(2)
    fireEvent.click(screen.getByRole('combobox', { name: 'Canal da consolidação' }))
    expect(screen.queryByRole('option', { name: 'eng/velho' })).toBeNull()
    fireEvent.click(await screen.findByRole('option', { name: 'eng/global' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver plano: Consolidação' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver plano' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('post', 'consolidation/run', { channel: 'eng/global', dry_run: true }))
    expect((await screen.findByTestId('consolidation-result')).textContent).toContain('Plano (nada foi gravado)')
  })

  it('rascunho pendente: a confirmação vira "Salvar e executar", grava antes e, se a gravação falhar, não executa', async () => {
    const saveDraft = vi.fn(async () => false)
    render(<ConsolidationActions dirty saveDraft={saveDraft} />)
    fireEvent.click(screen.getByRole('button', { name: 'Executar agora: Consolidação' }))
    expect(screen.queryByRole('button', { name: 'Executar agora' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e executar' }))
    await waitFor(() => expect(saveDraft).toHaveBeenCalled())
    expect(mocks.send).not.toHaveBeenCalled()
    saveDraft.mockResolvedValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Executar agora: Consolidação' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e executar' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('post', 'consolidation/run', {}))
    expect(saveDraft.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.send.mock.invocationCallOrder[0]!)
  })

  it('falha mostra o erro acionável e "Tentar novamente" executa de novo', async () => {
    mocks.send.mockRejectedValueOnce(new Error('rede'))
    render(<ConsolidationActions dirty={false} saveDraft={vi.fn(async () => true)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Executar agora: Consolidação' }))
    fireEvent.click(screen.getByRole('button', { name: 'Executar agora' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível executar a consolidação.')
    expect(mocks.toast.error).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2))
  })

  it('retenção não tem botão: mostra a última execução e que é automática', () => {
    mocks.status.retention = { last_run_at: '2026-11-02T10:00:00Z', removed: { usage_log: 3, jobs: 0 } }
    render(<RetentionInfo />)
    const info = screen.getByTestId('retention-info').textContent!
    expect(info).toContain('A retenção roda automaticamente')
    expect(info).toContain('usage_log 3')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('o botão compartilhado usa o fundo do card (não o do outline) e mostra o motivo quando bloqueado', () => {
    render(<RunNowButton label="X" blockReason="Salve antes" pending={false} onClick={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Executar agora: X' })
    expect(button.className).toContain('bg-transparent')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('run-now-blocked')).toBeTruthy()
  })
})
