/**
 * Número de telefone legível a partir dos dígitos do WhatsApp (puro).
 * - Brasil, celular (13 dígitos): `+55 (41) 9 8455-6795`;
 * - Brasil, fixo (12 dígitos): `+55 (41) 3333-4444`;
 * - outros países: `+<DDI> <resto>` (DDI de 1 a 3 dígitos não é deduzível com certeza: separa só o "+").
 * Entrada sem dígitos devolve `null`.
 */
export function formatPhoneNumber(raw: string | null | undefined): string | null {
    const digits = (raw ?? "").replace(/\D/g, "")
    if (!digits) return null
    if (digits.startsWith("55") && digits.length === 13) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`
    if (digits.startsWith("55") && digits.length === 12) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`
    return `+${digits}`
}

/** Segunda linha do perfil conectado: `@usuário · +55 (41) 9 8455-6795`, ou só o número (ou só o usuário). */
export function profileSecondLine(username: string | null | undefined, number: string | null | undefined): string | null {
    const handle = username?.trim() ? `@${username.trim().replace(/^@+/, "")}` : null
    const phone = formatPhoneNumber(number)
    return [handle, phone].filter(Boolean).join(" · ") || null
}
