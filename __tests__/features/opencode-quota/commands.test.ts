import { describe, expect, it } from 'vitest'
import { isValidQuotaExportPath, quotaExportCommand, quotaReadCommand } from '@/features/opencode-quota/commands'

describe('quotaExportCommand', () => {
  it('sem caminho usa o padrão do plugin com a expansão do shell', () => {
    const command = quotaExportCommand()
    expect(command).toContain('f="${XDG_CACHE_HOME:-$HOME/.cache}/opencode/quota-export.json"')
    expect(command).toContain('echo __OPENCODE_QUOTA_MISSING__')
  })

  it('caminho customizado vai entre aspas; ~/ expande o HOME', () => {
    expect(quotaExportCommand("/srv/it's/quota.json")).toContain(`f='/srv/it'\\''s/quota.json';`)
    expect(quotaExportCommand('~/quota.json')).toContain(`f="$HOME"/'quota.json';`)
  })

  it('recusa caminho relativo ou com quebra de linha', () => {
    expect(isValidQuotaExportPath('quota.json')).toBe(false)
    expect(isValidQuotaExportPath('/a\nb')).toBe(false)
    expect(() => quotaExportCommand('quota.json')).toThrow(/Caminho do arquivo de quota inválido/)
  })
})

describe('quotaReadCommand', () => {
  it('prefere o show --json do plugin instalado pelo OpenCode, sem npx', () => {
    const command = quotaReadCommand()
    expect(command).toContain('"${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/npm/@slkiser/opencode-quota@*/*/node_modules/@slkiser/opencode-quota/dist/bin/opencode-quota.js')
    expect(command).toContain('node "$b" show --json')
    expect(command).toContain('echo __OPENCODE_QUOTA_SNAPSHOT__')
    expect(command).not.toContain('npx')
  })

  it('cai no arquivo de export (com o caminho customizado) quando o snapshot falha', () => {
    const command = quotaReadCommand('/srv/quota.json')
    expect(command).toContain("else echo __OPENCODE_QUOTA_EXPORT__; f='/srv/quota.json';")
    expect(() => quotaReadCommand('quota.json')).toThrow(/Caminho do arquivo de quota inválido/)
  })
})
