/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import type { EnvironmentInput } from '@/features/environments/schemas'
import type { ComposeServicesDto } from '@/features/environments/types'

/** Leitura do compose da página (OPE-211): uma resposta antiga e lenta não sobrescreve a mais recente. */

type Pending = { ref: string; onSuccess: (data: ComposeServicesDto) => void }
const calls = vi.hoisted(() => [] as Pending[])

vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useReadComposeServices: () => ({
    mutate: (input: { source: { ref: string } }, options: { onSuccess: (data: ComposeServicesDto) => void }) => calls.push({ ref: input.source.ref, onSuccess: options.onSuccess }),
    isPending: false,
    isError: false,
  }),
}))

import { ComposeReadProvider, COMPOSE_READ_DEBOUNCE_MS, useComposeRead } from '@/features/environments/hooks/useFormComposeRead'

const read = (name: string): ComposeServicesDto => ({ services: [{ name, hasBuild: false, declared: null, limitStyle: 'mem_limit', values: null, unreadable: { ports: [], volumes: [] } } as unknown as ComposeServicesDto['services'][number]] })

function Names() {
  const { names } = useComposeRead()
  return <p data-testid="names">{names ? names.join(',') : 'nada'}</p>
}

const holder: { form: UseFormReturn<EnvironmentInput> | null } = { form: null }
function Harness() {
  const form = useForm<EnvironmentInput>({ defaultValues: { source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' } } as unknown as EnvironmentInput })
  useEffect(() => {
    holder.form = form
  }, [form])
  return (
    <ComposeReadProvider form={form} env={null}>
      <Names />
    </ComposeReadProvider>
  )
}

afterEach(() => {
  cleanup()
  calls.length = 0
  vi.useRealTimers()
})

describe('ComposeReadProvider', () => {
  it('regressão (F4): duas leituras resolvidas em ordem invertida ficam com a mais recente', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Harness />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(calls.map((call) => call.ref)).toEqual(['main'])
    act(() => holder.form!.setValue('source.ref' as never, 'feat/nova' as never))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPOSE_READ_DEBOUNCE_MS + 50)
    })
    expect(calls.map((call) => call.ref)).toEqual(['main', 'feat/nova'])
    // A nova termina primeiro; a antiga, mais lenta, chega depois e é descartada.
    act(() => calls[1]!.onSuccess(read('novo')))
    expect(screen.getByTestId('names').textContent).toBe('novo')
    act(() => calls[0]!.onSuccess(read('antigo')))
    expect(screen.getByTestId('names').textContent).toBe('novo')
  })

  it('na ordem certa, a resposta da leitura atual aparece', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Harness />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    act(() => calls[0]!.onSuccess(read('app')))
    expect(screen.getByTestId('names').textContent).toBe('app')
  })
})
