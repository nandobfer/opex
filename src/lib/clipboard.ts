/**
 * Copia texto para a área de transferência. Fora de um contexto seguro (app aberto por IP, sem
 * HTTPS) o `navigator.clipboard` não existe: cai no `execCommand("copy")` de um campo temporário.
 * Devolve `false` quando nenhum dos dois funcionou (a tela pede para copiar manualmente).
 */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // tenta o caminho alternativo
    }
    if (typeof document === "undefined") return false
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    try {
        return document.execCommand("copy")
    } catch {
        return false
    } finally {
        area.remove()
    }
}
