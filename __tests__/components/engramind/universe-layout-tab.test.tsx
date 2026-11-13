/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_UNIVERSE_LAYOUT, type UniverseLayoutConfig } from '@engramind/client'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * OPE-142: aba Visualização. Todos os números e escolhas do layout dos universos, com o padrão igual ao
 * desenho original (anéis), validação em tempo real pelo schema da lib, prévia, predefinições, exportar e
 * importar JSON (a importação só preenche o formulário; quem grava é o Salvar).
 */

const state = vi.hoisted(() => ({
  data: null as null | { config: Record<string, unknown>; isDefault: boolean; updatedAt: string | null },
  save: vi.fn(),
  reset: vi.fn(),
  previewConfigs: [] as unknown[],
}))

vi.mock('framer-motion', () => framerMotionMock())
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/features/engramind/hooks/useUniverseLayout', () => ({
  useUniverseLayout: () => ({ data: state.data, isLoading: false, error: null, refetch: async () => ({ data: state.data }) }),
  useSaveUniverseLayout: () => ({ mutate: state.save, isPending: false }),
  useResetUniverseLayout: () => ({ mutate: state.reset, isPending: false }),
}))
vi.mock('@/features/engramind/components/integration/universe-layout/UniverseLayoutPreview', () => ({
  UniverseLayoutPreview: ({ config }: { config: unknown }) => {
    state.previewConfigs.push(config)
    return <div data-testid="preview" data-config={JSON.stringify(config)} />
  },
  UniverseLayoutPreviewSkeleton: () => <div />,
}))

import { UniverseLayoutTab } from '@/features/engramind/components/integration/universe-layout/UniverseLayoutTab'

const input = (name: string) => document.getElementById(`universe-${name}`) as HTMLInputElement
const previewConfig = () => JSON.parse(screen.getByTestId('preview').getAttribute('data-config')!) as UniverseLayoutConfig
const mount = (onDirtyChange = vi.fn()) => render(<UniverseLayoutTab onDirtyChange={onDirtyChange} onConfigure={vi.fn()} />)

beforeEach(() => {
  vi.clearAllMocks()
  state.previewConfigs = []
  state.data = { config: { ...DEFAULT_UNIVERSE_LAYOUT }, isDefault: true, updatedAt: null }
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true })
})
afterEach(cleanup)

describe('aba Visualização', () => {
  it('abre com o padrão equivalente ao desenho original (anéis concêntricos, mais novas por dentro, sem desvio)', () => {
    mount()
    expect(input('firstRadius').value).toBe('150')
    expect(input('ringGap').value).toBe('58')
    expect(input('slot').value).toBe('46')
    expect(input('angleJitter').value).toBe('0')
    expect(input('radiusJitter').value).toBe('0')
    expect(screen.getByRole('radio', { name: 'Anéis' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Mais novas por dentro' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('universe-field-ringGap').textContent).toContain('Padrão: 58 px')
    expect(screen.getByTestId('universe-field-ringGap').textContent).toContain('Intervalo: 16 a 400 px')
    expect(screen.queryByText('Salvar')).toBeNull()
  })

  it('espiral: troca os campos dos anéis pelos da espiral', async () => {
    mount()
    expect(screen.getByTestId('universe-field-ringGap')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Espiral' }))
    expect(await screen.findByTestId('universe-field-spiralSpacing')).toBeTruthy()
    expect(screen.getByTestId('universe-field-spiralAngleDeg')).toBeTruthy()
    await waitFor(() => expect(screen.queryByTestId('universe-field-ringGap')).toBeNull())
  })

  it('os rótulos do sentido acompanham o critério', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: 'Uso' }))
    expect(screen.getByRole('radio', { name: 'Mais usadas por dentro' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Mais usadas por fora' })).toBeTruthy()
  })

  it('valor fora do intervalo: erro em pt-BR no campo e Salvar desabilitado', async () => {
    mount()
    fireEvent.change(input('ringGap'), { target: { value: '5' } })
    expect((await screen.findByRole('alert')).textContent).toBe('Distância entre anéis: o mínimo é 16 px')
    expect((screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input('ringGap'), { target: { value: '' } })
    expect((await screen.findByRole('alert')).textContent).toContain('informe um número')
  })

  it('Salvar grava a configuração completa e Voltar ao padrão restaura o campo', async () => {
    const onDirtyChange = vi.fn()
    mount(onDirtyChange)
    fireEvent.change(input('ringGap'), { target: { value: '84' } })
    fireEvent.change(input('angleJitter'), { target: { value: '35' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
    fireEvent.click(within(screen.getByTestId('universe-field-angleJitter')).getByRole('button', { name: /Voltar ao padrão/ }))
    await waitFor(() => expect(input('angleJitter').value).toBe('0'))
    fireEvent.click(await screen.findByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(state.save).toHaveBeenCalled())
    expect(state.save.mock.calls[0]![0]).toEqual({ ...DEFAULT_UNIVERSE_LAYOUT, ringGap: 84 })
  })

  it('Desfazer volta aos valores salvos', async () => {
    mount()
    fireEvent.change(input('slot'), { target: { value: '70' } })
    fireEvent.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(input('slot').value).toBe('46'))
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull()
  })

  it('a prévia recebe os valores ainda não salvos (e só os válidos)', async () => {
    mount()
    fireEvent.change(input('ringGap'), { target: { value: '90' } })
    await waitFor(() => expect(previewConfig().ringGap).toBe(90))
    fireEvent.change(input('ringGap'), { target: { value: '5' } })
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(previewConfig().ringGap).toBe(90)
    expect(state.save).not.toHaveBeenCalled()
  })

  it('predefinição: preenche o formulário como alteração pendente, sem gravar', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Anéis soltos/ }))
    await waitFor(() => expect(input('ringGap').value).toBe('84'))
    expect(input('slot').value).toBe('68')
    expect(input('angleJitter').value).toBe('35')
    expect(screen.getByRole('radio', { name: 'Mais novas por fora' }).getAttribute('aria-checked')).toBe('true')
    expect(await screen.findByRole('button', { name: /Salvar/ })).toBeTruthy()
    expect(state.save).not.toHaveBeenCalled()
  })

  it('OPE-164: as quatro predefinições aparecem, com "Relacionadas"', () => {
    mount()
    const group = screen.getByRole('group', { name: 'Predefinições' })
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
      expect.stringContaining('Anéis (padrão)'),
      expect.stringContaining('Anéis soltos'),
      expect.stringContaining('Espiral'),
      expect.stringContaining('Relacionadas'),
    ])
  })

  it('OPE-164: "Relacionadas" preenche os valores fixos e os links entre similares como pendente, sem mudar o link do autor', async () => {
    mount()
    fireEvent.click(document.getElementById('universe-authorLinks')!)
    await waitFor(() => expect((document.getElementById('universe-authorLinks') as HTMLInputElement).checked).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Relacionadas/ }))
    await waitFor(() => expect(input('ringGap').value).toBe('200'))
    expect(input('slot').value).toBe('120')
    expect(input('angleJitter').value).toBe('35')
    expect(input('radiusJitter').value).toBe('32')
    expect(screen.getByRole('radio', { name: 'Entre similares' }).getAttribute('aria-checked')).toBe('true')
    expect(input('relatedMax').value).toBe('3')
    expect((document.getElementById('universe-authorLinks') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('button', { name: /Relacionadas/ }).getAttribute('aria-pressed')).toBe('true')
    expect(state.save).not.toHaveBeenCalled()
  })

  it('OPE-164: "Arestas por memória" só aparece com links entre similares e recusa mais de 3', async () => {
    mount()
    expect(input('relatedMax')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Entre similares' }))
    await waitFor(() => expect(input('relatedMax')).toBeTruthy())
    fireEvent.change(input('relatedMax'), { target: { value: '4' } })
    expect(await screen.findByText('Arestas por memória: o máximo é 3')).toBeTruthy()
    expect(screen.getByTestId('universe-field-authorLinks').textContent).toContain('Padrão: ligado')
  })

  it('exportar: JSON com os valores do formulário (inclusive não salvos) e botão Copiar', async () => {
    mount()
    fireEvent.change(input('ringGap'), { target: { value: '72' } })
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }))
    const text = (await screen.findByLabelText('JSON da visualização')) as HTMLTextAreaElement
    expect(JSON.parse(text.value)).toEqual({ $schema: 'engramind-universe-layout', version: 1, ...DEFAULT_UNIVERSE_LAYOUT, ringGap: 72 })
    fireEvent.click(screen.getByRole('button', { name: /Copiar/ }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text.value))
    expect(toast.success).toHaveBeenCalledWith('JSON copiado')
  })

  it('importar JSON válido: preenche o formulário (ausentes no padrão), fica pendente e não grava', async () => {
    mount()
    fireEvent.change(input('slot'), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }))
    fireEvent.change(await screen.findByLabelText('JSON a importar'), { target: { value: '{"layout":"spiral","spiralSpacing":60,"jitterSeed":9}' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Importar/ }).at(-1)!)
    expect(await screen.findByTestId('universe-field-spiralSpacing')).toBeTruthy()
    expect(input('spiralSpacing').value).toBe('60')
    expect(input('jitterSeed').value).toBe('9')
    expect(input('minDistance').value).toBe('42')
    expect(state.save).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Configuração importada. Revise e salve.')
    expect(await screen.findByRole('button', { name: /Salvar/ })).toBeTruthy()
  })

  it('importar JSON inválido: lista os erros por campo e não altera nada', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }))
    const area = await screen.findByLabelText('JSON a importar')
    fireEvent.change(area, { target: { value: '{ nope' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Importar/ }).at(-1)!)
    expect((await screen.findByRole('alert')).textContent).toContain('JSON inválido')
    fireEvent.change(area, { target: { value: '{"ringGap":1,"slot":9999,"extra":1}' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Importar/ }).at(-1)!)
    const list = await screen.findByRole('alert')
    expect(list.textContent).toContain('Distância entre anéis: o mínimo é 16 px')
    expect(list.textContent).toContain('Espaço entre vizinhas: o máximo é 300 px')
    expect(list.textContent).toContain('Campo desconhecido: "extra"')
    expect(input('ringGap').value).toBe('58')
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('Restaurar padrão: desabilitado quando já vale o padrão; com configuração salva pede confirmação e apaga', async () => {
    const { unmount } = mount()
    expect((screen.getByRole('button', { name: /Restaurar padrão/ }) as HTMLButtonElement).disabled).toBe(true)
    unmount()
    state.data = { config: { ...DEFAULT_UNIVERSE_LAYOUT, ringGap: 84 }, isDefault: false, updatedAt: '2026-11-06T12:00:00.000Z' }
    mount()
    expect(input('ringGap').value).toBe('84')
    fireEvent.click(screen.getByRole('button', { name: /Restaurar padrão/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar padrão' }))
    await waitFor(() => expect(state.reset).toHaveBeenCalled())
  })

  it('regressão (abas de IA dentro de um form): sem form aninhado e o botão não envia o formulário de fora', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const { container } = render(
      <form onSubmit={onSubmit}>
        <UniverseLayoutTab onDirtyChange={vi.fn()} onConfigure={vi.fn()} />
      </form>,
    )
    expect(container.querySelectorAll('form form')).toHaveLength(0)
    fireEvent.change(input('slot'), { target: { value: '70' } })
    fireEvent.click(await screen.findByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(state.save).toHaveBeenCalled())
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
