import { createSecretBox, type EncryptedSecret } from "@nandobfer/integracoes/server"

/**
 * Cofre AES-256-GCM do app (`INTEGRATIONS_ENCRYPTION_KEY`) — SOMENTE servidor. É a mesma instância
 * entregue à central de integrações (`@nandobfer/integracoes`): formato `{ v, iv, tag, ct }` e
 * derivação de chave idênticos aos gravados antes da biblioteca. Fail-closed: sem chave, cifrar e
 * decifrar lançam `SecretBoxKeyError`.
 */
export const secretBox = createSecretBox()

export { SECRET_BOX_VERSION, SecretBoxDecryptError, SecretBoxKeyError, isEncryptedSecret, type EncryptedSecret } from "@nandobfer/integracoes/server"

export const isSecretBoxConfigured = (): boolean => secretBox.isConfigured()

/** Impressão digital curta da chave, para diagnosticar divergência entre instâncias sem expô-la. */
export const secretBoxKeyFingerprint = (): string | null => secretBox.fingerprint()

/** Subchave derivada da chave das integrações para outro uso (ex.: assinar tokens HMAC). */
export const deriveSubkey = (purpose: string): Buffer | null => secretBox.deriveSubkey(purpose)

export const encryptSecret = (plain: string): EncryptedSecret => secretBox.encrypt(plain)

export const decryptSecret = (box: EncryptedSecret): string => secretBox.decrypt(box)
