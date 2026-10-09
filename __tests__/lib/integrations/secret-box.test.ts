import { afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  isSecretBoxConfigured,
  SecretBoxDecryptError,
  SecretBoxKeyError,
} from '@/lib/crypto/secretBox'

const ORIGINAL = process.env.INTEGRATIONS_ENCRYPTION_KEY

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY
  else process.env.INTEGRATIONS_ENCRYPTION_KEY = ORIGINAL
})

describe('secretBox (issue #604)', () => {
  it('criptografa e descriptografa com a chave em base64, sem guardar texto puro', () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    const box = encryptSecret('senha-super-secreta')

    expect(isEncryptedSecret(box)).toBe(true)
    expect(JSON.stringify(box)).not.toContain('senha-super-secreta')
    expect(decryptSecret(box)).toBe('senha-super-secreta')
  })

  it('usa IV aleatório: o mesmo valor gera cifras diferentes', () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    expect(encryptSecret('x').ct === encryptSecret('x').ct && encryptSecret('x').iv === encryptSecret('x').iv).toBe(false)
  })

  it('aceita chave hexadecimal de 64 caracteres', () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('hex')
    expect(decryptSecret(encryptSecret('abc'))).toBe('abc')
  })

  it('detecta adulteração do valor cifrado', () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    const box = encryptSecret('valor')
    const tampered = { ...box, ct: Buffer.from('outro-valor').toString('base64') }
    expect(() => decryptSecret(tampered)).toThrow(SecretBoxDecryptError)
  })

  it('não descriptografa com uma chave diferente da usada na gravação', () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    const box = encryptSecret('valor')
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    expect(() => decryptSecret(box)).toThrow(SecretBoxDecryptError)
  })

  it('falha fechado sem chave ou com chave vazia', () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    expect(isSecretBoxConfigured()).toBe(false)
    expect(() => encryptSecret('x')).toThrow(SecretBoxKeyError)

    process.env.INTEGRATIONS_ENCRYPTION_KEY = '   '
    expect(isSecretBoxConfigured()).toBe(false)
    expect(() => encryptSecret('x')).toThrow(SecretBoxKeyError)
  })

  it('aceita qualquer texto como chave (regressão: chave curta era tratada como ausente)', () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'minhasenha1'
    expect(isSecretBoxConfigured()).toBe(true)
    const box = encryptSecret('valor')

    // Mesmo texto (inclusive com espaços nas pontas) deriva a mesma chave — sobrevive a reinício.
    process.env.INTEGRATIONS_ENCRYPTION_KEY = '  minhasenha1  '
    expect(decryptSecret(box)).toBe('valor')

    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'frase com espaços e acentuação'
    expect(decryptSecret(encryptSecret('abc'))).toBe('abc')
  })

  it('textos diferentes geram chaves diferentes', () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'senha-a'
    const box = encryptSecret('valor')
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'senha-b'
    expect(() => decryptSecret(box)).toThrow(SecretBoxDecryptError)
  })
})
