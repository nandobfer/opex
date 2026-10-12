import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  version: 'v1',
  createTransport: vi.fn(),
  verify: vi.fn(),
  sendMail: vi.fn(),
  loggerInfo: vi.fn(),
}))

vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }))
vi.mock('@/lib/integrations/config', () => ({
  getIntegration: vi.fn(async () => ({ values: mocks.values, version: mocks.version })),
}))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ info: vi.fn(), step: vi.fn(), request: vi.fn(), response: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: mocks.loggerInfo, warn: vi.fn(), error: vi.fn() } }))

import { getSmtpConfig, isMockMode, sendEmail, verifyConnection } from '@/lib/email/mailer'

const configured = { host: 'smtp.exemplo.com', port: 587, user: 'opex', password: 'segredo', from: 'Opex <nao-responda@exemplo.com>' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.values = { ...configured }
  // Versão nova a cada caso: o transporter em cache é recriado (o módulo guarda o último).
  mocks.version = String(Math.random())
  mocks.createTransport.mockReturnValue({ verify: mocks.verify, sendMail: mocks.sendMail })
  mocks.verify.mockResolvedValue(true)
  mocks.sendMail.mockResolvedValue({ messageId: 'id-1', response: '250 OK' })
})

describe('serviço de e-mail (SMTP)', () => {
  it('envia com remetente, destinatário, assunto e HTML a partir da integração', async () => {
    await sendEmail('cliente@exemplo.com', 'Assunto', '<p>Oi</p>')

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: 'smtp.exemplo.com',
      port: 587,
      secure: false,
      auth: { user: 'opex', pass: 'segredo' },
    })
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: 'Opex <nao-responda@exemplo.com>',
      to: 'cliente@exemplo.com',
      subject: 'Assunto',
      html: '<p>Oi</p>',
    })
  })

  it('usa o usuário como remetente quando o Remetente não é informado', async () => {
    mocks.values = { ...configured, from: undefined }
    await sendEmail('cliente@exemplo.com', 'Assunto', '<p>Oi</p>')
    expect(mocks.sendMail.mock.calls[0][0].from).toBe('opex')
  })

  it('na porta 465 usa TLS direto (secure) e na porta ausente cai em 587', async () => {
    mocks.values = { ...configured, port: 465 }
    await sendEmail('a@b.com', 'S', 'x')
    expect(mocks.createTransport.mock.calls[0][0].secure).toBe(true)

    mocks.values = { ...configured, port: undefined }
    mocks.version = String(Math.random())
    await sendEmail('a@b.com', 'S', 'x')
    expect(mocks.createTransport.mock.calls[1][0]).toMatchObject({ port: 587, secure: false })
  })

  it('sem usuário nem senha, cria o transporte sem autenticação', async () => {
    mocks.values = { ...configured, user: undefined, password: undefined, from: undefined }
    await sendEmail('a@b.com', 'S', 'x')
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }))
  })

  it('reutiliza o transporte e o recria quando a configuração muda', async () => {
    await sendEmail('a@b.com', 'S', 'x')
    await sendEmail('a@b.com', 'S', 'x')
    expect(mocks.createTransport).toHaveBeenCalledTimes(1)

    mocks.version = String(Math.random())
    await sendEmail('a@b.com', 'S', 'x')
    expect(mocks.createTransport).toHaveBeenCalledTimes(2)
  })

  it('sem host configurado, o envio é simulado (nada é enviado) e o modo mock fica sinalizado', async () => {
    mocks.values = { host: undefined, port: 587 }
    expect(await isMockMode()).toBe(true)
    expect(await getSmtpConfig()).toEqual({ host: undefined, port: 587, from: undefined, mock: true })

    await sendEmail('a@b.com', 'S', 'x')
    expect(mocks.sendMail).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).toHaveBeenCalled()
  })

  it('propaga a falha do servidor ao enviar', async () => {
    mocks.sendMail.mockRejectedValue(new Error('550 recusado'))
    await expect(sendEmail('a@b.com', 'S', 'x')).rejects.toThrow('550 recusado')
  })

  it('a verificação de conexão usa o transporter; sem host é um no-op', async () => {
    await verifyConnection()
    expect(mocks.verify).toHaveBeenCalledTimes(1)

    mocks.values = { host: undefined, port: 587 }
    await verifyConnection()
    expect(mocks.verify).toHaveBeenCalledTimes(1)
  })

  it('propaga a falha da verificação de conexão', async () => {
    mocks.verify.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(verifyConnection()).rejects.toThrow('ECONNREFUSED')
  })
})
