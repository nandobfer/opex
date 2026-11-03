/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * OPE-117: aba Configurações inteira (SettingsTab): ações nas seções certas, "Reindexar agora", o resultado
 * da consolidação sobrevivendo ao "Salvar e executar" (que remonta o formulário) e o editor de agendamento
 * seguindo o rascunho em "Voltar ao padrão" e "Desfazer".
 */

type Meta = { key: string; type: string; value: unknown; default: unknown; description: string; channel_override: boolean; updated_at: string | null; min?: number; max?: number }

const server = vi.hoisted(() => ({
  metas: [] as Meta[],
  embeddingState: 'ready' as string,
  send: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/engramind/hooks/useEngramind', async (original) => {
  const { useState } = await import('react')
  const settings = () => ({ settings: server.metas.map((meta) => ({ ...meta })) })
  const status = () => ({ embedding: { state: server.embeddingState, done: 0, total: 0 }, retention: null, consolidation: { next_run_at: null } })
  return {
    ...(await original<object>()),
    engramindSend: (method: string, path: string, body?: unknown) => server.send(method, path, body),
    useEngramindQuery: (path: string) => {
      const data = path === 'settings' ? settings() : status()
      return { data, isLoading: false, error: null, refetch: async () => ({ data: path === 'settings' ? settings() : status() }) }
    },
    useEngramindList: () => ({ items: [{ slug: 'eng/global', archived_at: null }], isLoading: false }),
    useEngramindMutation: (request: (variables: unknown) => Promise<unknown>) => {
      const [isPending, setPending] = useState(false)
      const mutateAsync = async (variables: unknown) => {
        setPending(true)
        try {
          return await request(variables)
        } finally {
          setPending(false)
        }
      }
      return { isPending, variables: undefined, mutateAsync, mutate: (variables: unknown, options?: { onSuccess?: (result: unknown) => void }) => void mutateAsync(variables).then((result) => options?.onSuccess?.(result)) }
    },
  }
})

import { SettingsTab } from '@/features/engramind/components/integration/settings/SettingsTab'

beforeEach(() => {
  vi.clearAllMocks()
  server.embeddingState = 'ready'
  server.metas = [
    { key: 'consolidation.schedule', type: 'cron', value: '0 3 * * *', default: '0 3 * * *', description: '', channel_override: false, updated_at: null },
    { key: 'consolidation.min_age_days', type: 'integer', value: 7, default: 7, description: '', channel_override: true, updated_at: null, min: 1, max: 365 },
    { key: 'embedding.batch_size', type: 'integer', value: 32, default: 32, description: '', channel_override: false, updated_at: null, min: 1, max: 512 },
    { key: 'embedding.query_prefix', type: 'text', value: '', default: '', description: '', channel_override: false, updated_at: null },
    { key: 'retention.usage_days', type: 'integer', value: 30, default: 30, description: '', channel_override: false, updated_at: null, min: 1, max: 3650 },
  ]
  server.send.mockImplementation(async (method: string, path: string, body?: { settings?: Record<string, unknown> }) => {
    if (method === 'put' && path === 'settings') {
      for (const [key, value] of Object.entries(body?.settings ?? {})) {
        const meta = server.metas.find((item) => item.key === key)!
        meta.value = value ?? meta.default
        meta.updated_at = value === null ? null : '2026-11-03T12:00:00Z'
      }
      return { settings: [] }
    }
    if (path === 'consolidation/run') return { dry_run: true, channels: [{ channel: 'eng/global', skipped: {}, duplicates: [{ keep: 'm_1', archive: 'm_2' }], classify: [], stale: { flag: [], clear: [], archive: [] } }], jobs: [] }
    if (path === 'embeddings/reembed') return { total: 12 }
    return {}
  })
})
afterEach(cleanup)

const mount = () => render(<SettingsTab onDirtyChange={vi.fn()} onConfigure={vi.fn()} />)
const minAge = () => screen.getAllByRole('spinbutton').find((input) => (input as HTMLInputElement).value === '7' || (input as HTMLInputElement).value === '9') as HTMLInputElement
const scheduleTime = () => screen.getAllByLabelText('Horário')[0]!.textContent
const prefixInput = () => screen.getAllByRole('textbox').find((input) => input.getAttribute('aria-label') !== 'Buscar configuração' && input.getAttribute('aria-label') !== 'Expressão cron (UTC)')!
const typeCron = (value: string) => {
  fireEvent.click(screen.getByRole('radio', { name: 'Expressão cron' }))
  fireEvent.change(screen.getByLabelText('Expressão cron (UTC)'), { target: { value } })
  fireEvent.click(screen.getByRole('radio', { name: 'Agendamento' }))
}

describe('SettingsTab', () => {
  it('cada seção tem a sua ação: consolidação (Ver plano/Executar), embeddings (Reindexar) e retenção (só informação)', () => {
    mount()
    expect(screen.getByTestId('consolidation-actions')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reindexar agora: Embeddings' })).toBeTruthy()
    expect(screen.getByTestId('retention-info').textContent).toContain('automaticamente')
  })

  it('"Reindexar agora": confirma e executa; bloqueado durante uma reindexação', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Reindexar agora: Embeddings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reindexar agora' }))
    await waitFor(() => expect(server.send).toHaveBeenCalledWith('post', 'embeddings/reembed', {}))
    cleanup()
    server.embeddingState = 'reindexing'
    mount()
    expect((screen.getByRole('button', { name: 'Reindexar agora: Embeddings' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('"Ver plano" + "Salvar e executar": grava, remonta o formulário e o plano continua na tela (com a busca)', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('Buscar configuração'), { target: { value: 'consolida' } })
    fireEvent.change(minAge(), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver plano: Consolidação' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e executar' }))
    await waitFor(() => expect(server.send).toHaveBeenCalledWith('post', 'consolidation/run', { dry_run: true }))
    expect(server.send.mock.calls[0]).toEqual(['put', 'settings', { settings: { 'consolidation.min_age_days': 9 } }])
    expect((await screen.findByTestId('consolidation-result')).textContent).toContain('Plano (nada foi gravado)')
    expect(server.metas.find((meta) => meta.key === 'consolidation.min_age_days')!.updated_at).not.toBeNull()
    // A busca sobreviveu ao remonte (a seção de retenção continua filtrada) e o POST saiu depois do PUT.
    expect((screen.getByLabelText('Buscar configuração') as HTMLInputElement).value).toBe('consolida')
    expect(screen.queryByTestId('retention-info')).toBeNull()
    expect(server.send.mock.calls.map(([method, path]) => `${method} ${path}`)).toEqual(['put settings', 'post consolidation/run'])
  })

  it('alteração de embedding no "Salvar e executar" pede a confirmação da reindexação; cancelar não grava nem executa', async () => {
    mount()
    fireEvent.change(prefixInput(), { target: { value: 'query: ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Executar agora: Consolidação' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e executar' }))
    expect(await screen.findByText('Trocar o embedding?')).toBeTruthy()
    expect(server.send).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.queryByText('Trocar o embedding?')).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(server.send).not.toHaveBeenCalled()
    expect(screen.queryByTestId('consolidation-result')).toBeNull()
  })

  it('"Reindexar agora" > "Salvar e executar" com o embedding alterado: grava (o PUT já reindexa) e não dispara o reembed de novo', async () => {
    mount()
    fireEvent.change(prefixInput(), { target: { value: 'query: ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reindexar agora: Embeddings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e executar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar e reindexar' }))
    await waitFor(() => expect(server.send).toHaveBeenCalledWith('put', 'settings', { settings: { 'embedding.query_prefix': 'query: ' } }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(server.send.mock.calls.some(([, path]) => path === 'embeddings/reembed')).toBe(false)
  })

  it('"Reindexar agora": o botão fica ocupado durante a execução, mesmo depois do remonte do "Salvar e executar"', async () => {
    let release: (value: unknown) => void = () => undefined
    mount()
    server.send.mockImplementation(async (method: string, path: string, body?: { settings?: Record<string, unknown> }) => {
      if (method === 'put') {
        for (const [key, value] of Object.entries(body?.settings ?? {})) Object.assign(server.metas.find((item) => item.key === key)!, { value, updated_at: '2026-11-03T12:00:00Z' })
        return {}
      }
      return new Promise((resolve) => (release = resolve))
    })
    fireEvent.change(minAge(), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reindexar agora: Embeddings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e executar' }))
    await waitFor(() => expect(server.send).toHaveBeenCalledWith('post', 'embeddings/reembed', {}))
    expect((screen.getByRole('button', { name: 'Reindexar agora: Embeddings' }) as HTMLButtonElement).disabled).toBe(true)
    release({ total: 3 })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Reindexar agora: Embeddings' }) as HTMLButtonElement).disabled).toBe(false))
  })

  it('agendamento acompanha "Voltar ao padrão" e "Desfazer" (o editor nunca mostra um horário que não vai ser salvo)', () => {
    mount()
    expect(scheduleTime()).toContain('00:00')
    typeCron('0 13 * * *')
    expect(scheduleTime()).toContain('10:00')
    // Só o campo alterado tem o "Voltar ao padrão" habilitado (os outros já valem o padrão).
    fireEvent.click(screen.getAllByRole('button', { name: /Voltar ao padrão/ }).find((button) => !(button as HTMLButtonElement).disabled)!)
    expect(scheduleTime()).toContain('00:00')
    typeCron('30 14 * * *')
    expect(scheduleTime()).toContain('11:30')
    fireEvent.click(screen.getByRole('button', { name: /Desfazer/ }))
    expect(scheduleTime()).toContain('00:00')
  })

  it('mensal num dia que não cabe no cron UTC bloqueia o Salvar (não mantém o cron anterior em silêncio)', () => {
    mount()
    typeCron('0 13 5 * *')
    fireEvent.change(screen.getByLabelText('Dia do mês'), { target: { value: '30' } })
    const save = screen.getByRole('button', { name: /^Salvar$/ }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(screen.getAllByText(/Mensal só até o dia 28/).length).toBeGreaterThan(0)
  })
})
