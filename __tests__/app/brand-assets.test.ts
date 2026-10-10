import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readPng(path: string) {
  const data = readFileSync(join(process.cwd(), path))
  expect(data.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(data.toString('ascii', 12, 16)).toBe('IHDR')
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
  }
}

describe('identidade visual do Opex', () => {
  it('disponibiliza o favicon quadrado na convenção automática do App Router', () => {
    const icon = readPng('src/app/icon.png')
    expect(icon.width).toBe(512)
    expect(icon.height).toBe(512)
    expect(icon.colorType).toBe(6) // RGBA: preserva transparência no tema da aba.
  })

  it('preserva a logo completa horizontal e transparente como asset público', () => {
    const logo = readPng('public/opex-logo.png')
    expect(logo.width).toBeGreaterThan(logo.height)
    expect(logo.colorType).toBe(6)
  })
})
