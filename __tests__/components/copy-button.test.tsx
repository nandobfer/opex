/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../helpers/framer-motion'

/** CopyButton (OPE-211) e o SecretReveal migrado para ele. */

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast }))

import { CopyButton } from '@/components/ui/copy-button'
import { SecretReveal } from '@/components/ui/secret-reveal'

const clipboard = (writeText: (text: string) => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CopyButton', () => {
  it('copia, avisa e volta ao ícone de copiar depois do tempo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const writeText = vi.fn(async () => undefined)
    clipboard(writeText)
    render(<CopyButton value="http://h:4100" label="Copiar link" successMessage="Link copiado." />)
    const button = screen.getByRole('button', { name: 'Copiar link' })
    expect(button.getAttribute('title')).toBe('Copiar link')
    fireEvent.click(button)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://h:4100'))
    expect(toast.success).toHaveBeenCalledWith('Link copiado.')
    expect(button.querySelector('.text-success')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    expect(button.querySelector('.text-success')).toBeNull()
  })

  it('falha ao copiar: toast de erro', async () => {
    clipboard(vi.fn(async () => Promise.reject(new Error('negado'))))
    render(<CopyButton value="x" label="Copiar" successMessage="ok" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível copiar: selecione e copie manualmente.'))
  })
})

describe('SecretReveal (usa o CopyButton)', () => {
  it('copia o valor com o rótulo e o toast de antes, e o ícone fica como copiado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const writeText = vi.fn(async () => undefined)
    clipboard(writeText)
    render(<SecretReveal value="mt_sys_abc" noun="Token" hint="Guarde agora" />)
    expect(screen.getByText('mt_sys_abc')).toBeTruthy()
    expect(screen.getByText('Guarde agora')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Copiar token' })
    fireEvent.click(button)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('mt_sys_abc'))
    expect(toast.success).toHaveBeenCalledWith('Token copiado.')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(button.querySelector('.text-success')).toBeTruthy()
  })
})
