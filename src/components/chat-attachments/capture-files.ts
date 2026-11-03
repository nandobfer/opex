/** Evento de colar ou soltar (React ou nativo), com os arquivos em `clipboardData` ou `dataTransfer`. */
interface FilesEvent {
    clipboardData?: DataTransfer | null
    dataTransfer?: DataTransfer | null
    preventDefault: () => void
    stopPropagation: () => void
}

/**
 * Arquivos colados/soltos num campo de texto, lidos na **captura** do contêiner: o evento é
 * interceptado antes do campo, então vale também no modo Vim (o editor substitui o `<textarea>` e
 * o `DataTransfer` só tem os arquivos dentro do evento original). Com arquivos, impede o
 * comportamento padrão e a propagação (o editor não recebe a colagem) e os entrega a `onFiles`;
 * sem arquivos (texto), o evento segue normalmente. `true` quando os arquivos foram assumidos.
 */
export function captureFiles(event: FilesEvent, onFiles: (files: File[]) => void, disabled = false): boolean {
    const data = event.clipboardData ?? event.dataTransfer
    const files = Array.from(data?.files ?? []).filter((file) => file.size > 0)
    if (!files.length || disabled) return false
    event.preventDefault()
    event.stopPropagation()
    onFiles(files)
    return true
}
