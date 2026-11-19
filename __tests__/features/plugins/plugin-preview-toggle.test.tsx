/** @vitest-environment happy-dom */

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chave "Ligar prévia" (OPE-172) com os hooks reais: o estado ligado vem da lista do cookie que o
 * servidor devolve — também para um plugin de CLIENTE aberto no app do dono, que não entra nos
 * plugins montados do dono.
 */

const holder = vi.hoisted(() => ({ previewOn: [] as string[], get: vi.fn(), post: vi.fn() }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api', () => ({
  api: { get: holder.get, post: holder.post },
  apiErrorMessage: (_e: unknown, fallback: string) => fallback,
  unwrapApi: (body: { data: unknown }) => body.data,
}))

import { PluginPreviewToggle } from '@/features/plugins/components/PluginPreviewToggle'

beforeEach(() => {
  holder.previewOn = []
  holder.get.mockImplementation(async (url: string) => {
    if (url === '/plugins/runtime') return { data: { success: true, data: { plugins: [], previewOn: holder.previewOn } } }
    throw new Error(`GET inesperado: ${url}`)
  })
  holder.post.mockImplementation(async (url: string, body: { on: boolean }) => {
    holder.previewOn = body.on ? ['painel'] : []
    return { data: { success: true, data: { previewOn: holder.previewOn } } }
  })
})

const renderToggle = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PluginPreviewToggle pluginId="painel" previewUrl="/cliente/dashboard" />
    </QueryClientProvider>,
  )

describe('PluginPreviewToggle (plugin de cliente no app do dono)', () => {
  it('ligar marca a chave e mostra "Ver prévia"; desligar volta', async () => {
    renderToggle()
    const toggle = () => screen.getByRole('checkbox') as HTMLInputElement
    await waitFor(() => expect(toggle().disabled).toBe(false))
    expect(toggle().checked).toBe(false)
    expect(screen.queryByText('Ver prévia')).toBeNull()

    fireEvent.click(toggle())
    await waitFor(() => expect(toggle().checked).toBe(true))
    expect(holder.post).toHaveBeenCalledWith('/plugins/painel/preview', { on: true })
    expect(screen.getByText('Ver prévia').closest('a')?.getAttribute('href')).toBe('/cliente/dashboard')

    await waitFor(() => expect(toggle().disabled).toBe(false))
    fireEvent.click(toggle())
    await waitFor(() => expect(toggle().checked).toBe(false))
    expect(screen.queryByText('Ver prévia')).toBeNull()
  })

  it('a prévia já ligada no cookie aparece ligada ao abrir', async () => {
    holder.previewOn = ['painel']
    renderToggle()
    await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true))
  })
})
