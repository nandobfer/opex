import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ values: { url: 'http://gotenberg:3000/', timeoutSeconds: 30, urlTtlMinutes: 15, urlTtlMaxMinutes: 60 } as Record<string, unknown> }))

// O cliente HTTP é o da integração Gotenberg da biblioteca (OPE-217): os mocks valem dentro dela (`server.deps.inline`).
vi.mock('@nandobfer/integracoes/modules/server/config', () => ({ getIntegration: async () => ({ values: mocks.values }) }))
vi.mock('@nandobfer/integracoes/modules/server/debug', () => ({ integrationDebug: () => ({ info: vi.fn(), step: vi.fn(), request: vi.fn(), response: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import { gotenbergHealth } from '@nandobfer/integracoes/gotenberg/server'
import { convertHtmlToPdf, pdfFormFields, screenshotHtml } from '@/lib/pdf/gotenberg'
import { previewHtml } from '@/lib/pdf/preview'

const fetchMock = vi.fn()

beforeEach(() => {
  mocks.values = { url: 'http://gotenberg:3000/', timeoutSeconds: 30 }
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const baseOptions = { format: 'A4' as const, orientation: 'retrato' as const, marginsMm: { top: 10, right: 12, bottom: 10, left: 12 }, background: true, preferCssPageSize: false, scale: 0.97 }

describe('cliente do Gotenberg (OPE-210)', () => {
  it('monta formato, orientação, margens, fundo, @page e escala', () => {
    expect(pdfFormFields(baseOptions)).toEqual({
      paperWidth: '8.27',
      paperHeight: '11.69',
      marginTop: '0.3937',
      marginRight: '0.4724',
      marginBottom: '0.3937',
      marginLeft: '0.4724',
      printBackground: 'true',
      preferCssPageSize: 'false',
      scale: '0.97',
    })
    expect(pdfFormFields({ ...baseOptions, format: 'Carta', orientation: 'paisagem' })).toMatchObject({ paperWidth: '11', paperHeight: '8.5' })
  })

  it('envia o HTML como index.html na rota de conversão', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('%PDF'), { status: 200 }))
    const pdf = await convertHtmlToPdf('<p>oi</p>', baseOptions)
    expect(pdf.toString()).toBe('%PDF')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://gotenberg:3000/forms/chromium/convert/html')
    const form = init.body as FormData
    expect((form.get('files') as File).name).toBe('index.html')
    expect(form.get('scale')).toBe('0.97')
  })

  it('prévia PNG pela rota de screenshot, com largura e altura da página', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('PNG'), { status: 200 }))
    await screenshotHtml('<p>x</p>', { width: 794, height: 1122 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://gotenberg:3000/forms/chromium/screenshot/html')
    const form = init.body as FormData
    expect(form.get('format')).toBe('png')
    expect(form.get('width')).toBe('794')
    expect(form.get('height')).toBe('1122')
  })

  it('HTTP de erro vira mensagem em pt-BR sem o HTML', async () => {
    fetchMock.mockResolvedValue(new Response('chromium crashed', { status: 500 }))
    const error = await convertHtmlToPdf('<p>segredo do documento</p>', baseOptions).catch((err: Error) => err)
    expect(error).toMatchObject({ status: 502, code: 'GOTENBERG_FAILED' })
    expect((error as Error).message).toContain('HTTP 500')
    expect((error as Error).message).not.toContain('segredo do documento')
  })

  it('tempo limite da integração vira 504 acionável', async () => {
    mocks.values = { url: 'http://gotenberg:3000', timeoutSeconds: 0.01 }
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')))))
    await expect(convertHtmlToPdf('<p>x</p>', baseOptions)).rejects.toMatchObject({ status: 504, code: 'GOTENBERG_TIMEOUT' })
  })

  it('sem URL configurada: erro pedindo a configuração', async () => {
    mocks.values = { timeoutSeconds: 30 }
    await expect(convertHtmlToPdf('<p>x</p>', baseOptions)).rejects.toMatchObject({ code: 'GOTENBERG_NOT_CONFIGURED' })
  })

  it('health devolve o estado do Gotenberg e do Chromium', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'up', details: { chromium: { status: 'down' } } }))
    expect(await gotenbergHealth()).toEqual({ status: 'up', chromium: 'down' })
  })

  it('a prévia injeta margens e a escala do PDF', () => {
    const html = previewHtml('<html><head></head><body>x</body></html>', { marginsMm: { top: 13, right: 14, bottom: 13, left: 14 }, scale: 0.97 })
    expect(html).toContain('zoom:0.97')
    expect(html).toContain('padding:13.4mm 14.43mm 13.4mm 14.43mm')
    expect(html.indexOf('data-opex-preview')).toBeLessThan(html.indexOf('</head>'))
  })
})
