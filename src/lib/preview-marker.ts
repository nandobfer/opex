/**
 * Marcação de prévia (OPE-147) passada ao `docker compose` da publicação ou da recriação de uma prévia
 * (o `docker-compose.yml` do Opex a repassa ao container): o app sabe que é uma prévia (agendador
 * automático desligado, banco compartilhado com o original) e o endereço em que o host o alcança
 * (`http://<previewHost>:<porta>`, o mesmo que a mesa usa para a prévia). Em projetos que não leem
 * essas variáveis ela não tem efeito. Módulo puro, sem dependências de servidor.
 */
export function previewMarkerEnv(host: string | null, port: number): string {
    const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
    return host ? `OPEX_PREVIEW=1 OPEX_PREVIEW_URL=${quote(`http://${host}:${port}`)}` : "OPEX_PREVIEW=1"
}
