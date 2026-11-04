/** O happy-dom pode serializar a cor de um `style` inline em hex ou em rgb(): confere os dois. */
export function styleHasColor(style: string | null | undefined, hex: string): boolean {
  const value = (style ?? '').toLowerCase().replace(/\s/g, '')
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  return value.includes(hex.toLowerCase()) || value.includes(`rgb(${r},${g},${b})`)
}
