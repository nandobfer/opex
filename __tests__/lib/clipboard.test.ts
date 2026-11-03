/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '@/lib/clipboard'

/**
 * `copyText` (base do "Copiar Mermaid/Markdown"): API de área de transferência quando existe; fora de
 * contexto seguro (app aberto por IP, sem HTTPS), o `execCommand("copy")` de um campo temporário.
 */

const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
const setExecCommand = (impl: (command: string) => boolean) => Object.defineProperty(document, 'execCommand', { value: vi.fn(impl), configurable: true, writable: true })

afterEach(() => {
  setClipboard(undefined)
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('com a API de área de transferência, copia por ela', async () => {
    const writeText = vi.fn(async () => undefined)
    setClipboard({ writeText })
    setExecCommand(() => true)
    expect(await copyText('graph LR')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('graph LR')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('sem a API (contexto não seguro): copia pelo campo temporário e o remove', async () => {
    setClipboard(undefined)
    let copied = ''
    setExecCommand((command) => {
      const area = document.querySelector('textarea')
      copied = area?.value ?? ''
      return command === 'copy'
    })
    expect(await copyText('## Arquitetura')).toBe(true)
    expect(copied).toBe('## Arquitetura')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('a API recusa (permissão negada): cai no campo temporário', async () => {
    setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) })
    setExecCommand(() => true)
    expect(await copyText('x')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('nenhum dos dois funciona: devolve false (a tela pede para copiar manualmente)', async () => {
    setClipboard(undefined)
    setExecCommand(() => false)
    expect(await copyText('x')).toBe(false)
    setExecCommand(() => {
      throw new Error('não suportado')
    })
    expect(await copyText('x')).toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })
})
