/**
 * Comandos (puros) do executor desacoplado: o comando longo roda em segundo plano no host
 * (`setsid nohup`), com a saída e o código de saída em arquivos, e o app acompanha por consultas
 * curtas. O processo não depende do shell do OpenCode que o iniciou — o OpenCode pode descartar os
 * shells (reciclagem do diretório, limite de shells encerrados) sem derrubar o comando.
 */

/** Pasta dos jobs no host. */
export const DETACHED_JOBS_DIR = "$HOME/.cache/opex/jobs"

/** Tamanho máximo de cada pedaço lido por consulta (bytes, antes do base64). */
export const DETACHED_CHUNK_BYTES = 65_536

const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/

export function assertJobId(id: string): string {
    if (!JOB_ID.test(id)) throw new Error(`Id de job inválido: ${id}`)
    return id
}

export const jobDir = (id: string) => `"${DETACHED_JOBS_DIR}/${assertJobId(id)}"`

/**
 * Inicia o job (idempotente: com o pidfile já gravado não inicia de novo). O comando vai em base64
 * para `cmd.sh` e roda com `bash` sob `timeout`; ao terminar grava o código em `exit` (atômico).
 */
export function detachedStartCommand(id: string, command: string, timeoutSeconds: number): string {
    const dir = jobDir(id)
    const encoded = Buffer.from(command, "utf8").toString("base64")
    const seconds = Math.max(1, Math.ceil(timeoutSeconds))
    const runner = `timeout ${seconds} bash "$0/cmd.sh" > "$0/out" 2>&1; echo $? > "$0/exit.tmp"; mv "$0/exit.tmp" "$0/exit"`
    return [
        `mkdir -p ${dir}`,
        `if [ -s ${dir}/pid ]; then echo started; else printf %s '${encoded}' | base64 -d > ${dir}/cmd.sh && : > ${dir}/out && (setsid nohup sh -c '${runner}' ${dir} > /dev/null 2>&1 < /dev/null & echo $! > ${dir}/pid) && echo started; fi`,
    ].join(" && ")
}

/**
 * Consulta: `exit=<código ou vazio>` e `size=<bytes>` (o código é lido antes do tamanho: com ele
 * presente, o tamanho já é o final), `---` e o pedaço novo da saída a partir de `offset`, em base64.
 * Pasta ausente → `missing=1`.
 */
export function detachedPollCommand(id: string, offset: number): string {
    const dir = jobDir(id)
    const from = Math.max(0, Math.floor(offset)) + 1
    return [
        `d=${dir}`,
        `if [ ! -d "$d" ]; then echo missing=1; exit 0; fi`,
        `e=$(cat "$d/exit" 2>/dev/null)`,
        `s=$(stat -c %s "$d/out" 2>/dev/null || echo 0)`,
        `printf 'exit=%s\\nsize=%s\\n---\\n' "$e" "$s"`,
        `tail -c +${from} "$d/out" 2>/dev/null | head -c ${DETACHED_CHUNK_BYTES} | base64 -w0`,
    ].join("; ")
}

/**
 * Cancela: TERM no grupo do processo (o `setsid` fez dele o líder) e no `timeout`, que sai desse grupo
 * (`setpgid`) e leva o comando junto; depois fecha o job gravando `exit=143` se o `sh` morreu antes de
 * gravá-lo — senão a consulta nunca veria o fim e esperaria até o prazo.
 */
export function detachedCancelCommand(id: string): string {
    const dir = jobDir(id)
    return [
        `p=$(cat ${dir}/pid 2>/dev/null)`,
        `if [ -n "$p" ]; then for c in $(pgrep -P "$p" 2>/dev/null); do kill -TERM -- -"$c" 2>/dev/null; kill -TERM "$c" 2>/dev/null; done; kill -TERM -- -"$p" 2>/dev/null; fi`,
        `sleep 1`,
        `[ -f ${dir}/exit ] || { echo 143 > ${dir}/exit.tmp && mv ${dir}/exit.tmp ${dir}/exit; }`,
        `true`,
    ].join("; ")
}

/** Apaga a pasta do job. */
export const detachedCleanupCommand = (id: string) => `rm -rf ${jobDir(id)}`

export interface DetachedPoll {
    missing: boolean
    exitCode: number | null
    size: number
    chunk: Buffer
}

/** Lê a saída da consulta (puro). */
export function parseDetachedPoll(output: string): DetachedPoll {
    const text = output.replace(/\r/g, "")
    if (/^missing=1\s*$/m.test(text) && !text.includes("---")) return { missing: true, exitCode: null, size: 0, chunk: Buffer.alloc(0) }
    const marker = text.indexOf("---\n")
    const head = marker === -1 ? text : text.slice(0, marker)
    const body = marker === -1 ? "" : text.slice(marker + 4)
    const exitMatch = /^exit=(\d*)\s*$/m.exec(head)
    const sizeMatch = /^size=(\d+)\s*$/m.exec(head)
    const exitCode = exitMatch?.[1] ? Number(exitMatch[1]) : null
    return { missing: false, exitCode, size: sizeMatch ? Number(sizeMatch[1]) : 0, chunk: Buffer.from(body.replace(/\s+/g, ""), "base64") }
}
