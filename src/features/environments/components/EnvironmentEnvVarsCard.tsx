"use client"

import { useState } from "react"
import { AlertTriangle, FileCode2, Plus, RefreshCw, Save, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useHostEnvFile, useUpdateHostEnvFile, type AmbientesApi } from "../hooks"
import { diffEnvRows, type EnvRow } from "../logic"
import type { HostEnvFileDto } from "../types"

interface Row extends EnvRow {
    /** Chave que existe no host (permite distinguir inclusão de alteração). */
    existing: boolean
}

function toRows(data: HostEnvFileDto): Row[] {
    return data.entries.map((entry) => ({ key: entry.key, value: entry.value ?? "", secret: entry.secret, existing: true }))
}

/** Editor das linhas do `.env` (estado local reiniciado pela `key` quando o arquivo muda no host). */
function EnvRowsEditor({ context, envId, data }: { context: AmbientesApi; envId: string; data: HostEnvFileDto }) {
    const update = useUpdateHostEnvFile(context, envId)
    const [rows, setRows] = useState<Row[]>(() => toRows(data))
    const original = toRows(data)
    const changes = diffEnvRows(original, rows)

    return (
        <>
            {rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma variável encontrada. Adicione a primeira abaixo.</p>}
            {rows.map((row, index) => (
                <div key={`${row.key}-${index}`} className="flex items-center gap-2">
                    <Input
                        aria-label="Nome da variável"
                        value={row.key}
                        readOnly={row.existing}
                        onChange={(event) => setRows((list) => list.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)))}
                        className="w-48 font-mono"
                    />
                    <Input
                        aria-label="Valor"
                        type={row.secret ? "password" : "text"}
                        value={row.value}
                        autoComplete="off"
                        placeholder={row.secret ? "•••• (substituir)" : ""}
                        onChange={(event) => setRows((list) => list.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))}
                        className="flex-1 font-mono"
                    />
                    {row.secret && <Badge variant="secondary" className="shrink-0">sensível</Badge>}
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remover variável" onClick={() => setRows((list) => list.filter((_, i) => i !== index))}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, { key: "", value: "", secret: false, existing: false }])}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Adicionar variável
                </Button>
                <Button type="button" size="sm" disabled={changes.length === 0 || update.isPending} onClick={() => update.mutate({ revision: data.revision, changes })}>
                    <Save className="mr-2 h-4 w-4" aria-hidden />
                    {update.isPending ? "Salvando…" : "Salvar no host"}
                </Button>
            </div>
        </>
    )
}

/**
 * Variáveis do `.env` **real** do host. Os nomes e valores não sensíveis são carregados; o valor de
 * uma variável sensível nunca é exibido (mesmo para o dono) — só é possível substituí-lo. Salvar
 * grava no arquivo do host; a mudança só vale nos containers após publicar/recriar.
 */
export function EnvironmentEnvVarsCard({ context, envId, envFile }: { context: AmbientesApi; envId: string; envFile: string }) {
    const query = useHostEnvFile(context, envId, Boolean(envId))

    if (query.isLoading) return <Skeleton className="h-40 w-full" />
    if (query.isError) {
        return <ErrorState title="Não foi possível ler o .env no host" description="Confira o host do ambiente (OpenCode/SSH) e o diretório." onRetry={() => void query.refetch()} />
    }
    const data = query.data

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <FileCode2 className="h-4 w-4 text-primary" aria-hidden />
                    Variáveis do .env
                    <span className="font-mono text-xs font-normal text-muted-foreground">{data?.path ?? envFile}</span>
                    {data && !data.exists ? <Badge variant="secondary">Arquivo ainda não existe</Badge> : null}
                    <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label="Recarregar o .env" onClick={() => void query.refetch()}>
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {data ? <EnvRowsEditor key={data.revision} context={context} envId={envId} data={data} /> : null}
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    O arquivo é o do host. Alterar variáveis <strong>não</strong> reinicia os containers: publique (ou recrie) para aplicar. Variáveis sensíveis nunca são exibidas e só o dono pode substituí-las.
                </p>
            </CardContent>
        </Card>
    )
}
