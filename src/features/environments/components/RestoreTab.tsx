"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { restoreCompatibility } from "../logic"
import { useEnvironmentOperation } from "../hooks/useEnvironments"
import type { EnvironmentDetail, ImageDto } from "../types"
import { EnvironmentStatusBadge, type EnvironmentTone } from "./EnvironmentStatusBadge"
import { OperationsHistory } from "./OperationsHistory"

const COMPATIBILITY: Record<"compatible" | "blocked" | "unknown", { label: string; tone: EnvironmentTone; note: string }> = {
    compatible: {
        label: "Compatível",
        tone: "emerald",
        note: "Compatível com o banco registrado no Opex.",
    },
    blocked: {
        label: "Bloqueado",
        tone: "destructive",
        note: "Incompatível com o banco registrado: restaure o banco antes de usar esta imagem.",
    },
    unknown: {
        label: "Desconhecido",
        tone: "amber",
        note: "Compatibilidade desconhecida: exige confirmação explícita do risco.",
    },
}

/** Aba Restaurar: escolhe uma imagem publicada antes e recria os containers com ela. */
export function RestoreTab({ repoId, data }: { repoId: string; data: EnvironmentDetail }) {
    const environment = data.environment
    const [selection, setSelection] = useState<ImageDto | null>(null)
    const [risk, setRisk] = useState(false)
    const action = useEnvironmentOperation(repoId, environment.id)
    const busy = Boolean(environment.activeOperationId) || action.isPending
    const compatibility = restoreCompatibility(environment.dbVersion, selection?.dbVersion ?? null)
    const unknown = Boolean(selection) && compatibility === "unknown"
    const submit = () => {
        action.mutate(
            {
                kind: "restore",
                method: "host",
                imageId: selection?.id,
                confirmation: true,
                riskConfirmed: risk,
                expectedRevision: environment.revision,
                requestId: crypto.randomUUID(),
            },
            { onSuccess: () => setRisk(false) },
        )
    }
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Imagens publicadas</CardTitle>
                        <CardDescription>
                            Compatibilidade pelo estado registrado no Opex, sujeito a alterações externas. Trocar a imagem não
                            reverte o banco.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!data.images.length ? (
                            <p className="text-sm text-muted-foreground">
                                Nenhuma imagem registrada. Inspecione o host na aba Compose ou publique uma versão.
                            </p>
                        ) : (
                            <ul className="divide-y">
                                {data.images.map((image) => {
                                    const status = restoreCompatibility(environment.dbVersion, image.dbVersion)
                                    const badge = COMPATIBILITY[status]
                                    return (
                                        <li key={image.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
                                            <div className="min-w-0 space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="break-all font-medium">{image.version}</span>
                                                    <EnvironmentStatusBadge label={badge.label} tone={badge.tone} />
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {image.builtAt
                                                        ? format(new Date(image.builtAt), "dd/MM/yyyy HH:mm", { locale: ptBR })
                                                        : "Data do build desconhecida"}{" "}
                                                    · {image.origin} · banco {image.dbVersion ?? "desconhecido"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{badge.note}</p>
                                            </div>
                                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={busy || status === "blocked"}
                                                    onClick={() => {
                                                        setSelection(image)
                                                        setRisk(false)
                                                    }}
                                                >
                                                    <History className="h-4 w-4" aria-hidden /> Restaurar esta versão
                                                </Button>
                                                {status === "blocked" && (
                                                    <span
                                                        className="inline-flex items-center rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground"
                                                        title="A restauração do banco ainda não está disponível"
                                                    >
                                                        Restaurar banco — Em desenvolvimento
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </CardContent>
                </Card>
                <OperationsHistory operations={data.operations} />
            </div>
            <AlertDialog open={Boolean(selection)} onOpenChange={(open) => !open && setSelection(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restaurar versão?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A ação recria os containers de {environment.name} com a imagem escolhida e continua no servidor após
                            fechar a tela. Não há restauração automática do banco.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {unknown && (
                        <label className="flex items-start gap-3 text-sm">
                            <input type="checkbox" checked={risk} onChange={(event) => setRisk(event.target.checked)} />
                            Entendo o risco: a compatibilidade do banco é desconhecida e desejo continuar.
                        </label>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy || (unknown && !risk)}
                            onClick={(event) => {
                                event.preventDefault()
                                submit()
                            }}
                        >
                            Confirmar restauração
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
