import { describe, expect, it, vi } from 'vitest'
import { captureFiles } from '@/components/chat-attachments/capture-files'

function event(data: { clipboardData?: unknown; dataTransfer?: unknown }) {
  return { ...data, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Parameters<typeof captureFiles>[0] & {
    preventDefault: ReturnType<typeof vi.fn>
    stopPropagation: ReturnType<typeof vi.fn>
  }
}

const png = () => new File(['x'], 'print.png', { type: 'image/png' })

describe('captureFiles: arquivos colados/soltos no contêiner do campo', () => {
  it('colar arquivo entrega os arquivos e impede que o campo receba a colagem', () => {
    const onFiles = vi.fn()
    const file = png()
    const paste = event({ clipboardData: { files: [file] } })
    expect(captureFiles(paste, onFiles)).toBe(true)
    expect(onFiles).toHaveBeenCalledWith([file])
    expect(paste.preventDefault).toHaveBeenCalled()
    expect(paste.stopPropagation).toHaveBeenCalled()
  })

  it('soltar arquivo lê o dataTransfer', () => {
    const onFiles = vi.fn()
    const file = png()
    expect(captureFiles(event({ dataTransfer: { files: [file] } }), onFiles)).toBe(true)
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('texto, arquivo vazio ou campo desabilitado seguem sem captura', () => {
    const onFiles = vi.fn()
    const text = event({ clipboardData: { files: [] } })
    expect(captureFiles(text, onFiles)).toBe(false)
    expect(captureFiles(event({ clipboardData: { files: [new File([], 'vazio.png')] } }), onFiles)).toBe(false)
    expect(captureFiles(event({ clipboardData: { files: [png()] } }), onFiles, true)).toBe(false)
    expect(onFiles).not.toHaveBeenCalled()
    expect(text.preventDefault).not.toHaveBeenCalled()
  })
})
