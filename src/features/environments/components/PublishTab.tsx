"use client"

import { useState } from "react"
import { Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
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
import { randomId } from "@/lib/random-id"
import { useEnvironmentOperation } from "../hooks/useEnvironments"
import type { EnvironmentDetail } from "../types"
import { OperationsHistory } from "./OperationsHistory"

/** Aba Publicar: escolhe o método (host ou CD) e dispara a publicação, com confirmação explícita. */
export function PublishTab({ repoId, data }: { repoId: string; data: EnvironmentDetail }) {
    const environment = data.environment
    const [method, setMethod] = useState<"host" | "cd">("host")
    const [confirming, setConfirming] = useState(false)
    const action = useEnvironmentOperation(repoId, environment.id)
    const busy = Boolean(environment.activeOperationId) || action.isPending
    const submit = () => {
        action.mutate(
            {
                kind: "publish",
                method,
                confirmation: true,
                riskConfirmed: false,
                expectedRevision: environment.revision,
                requestId: randomId(),
            },
            { onSuccess: () => setConfirming(false) },
        )
    }
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Publicar versão</CardTitle>
                        <CardDescription>
                            O agente publica a branch <span className="font-mono text-foreground">{environment.branch}</span> no
                            host do ambiente. As imagens ficam no Docker do host e uma falha de saúde não provoca rollback
                            automático.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Field id="publish-method" label="Método de publicação">
                            <OptionTabs<"host" | "cd">
                                id="publish-method"
                                aria-label="Método de publicação"
                                options={[
                                    { value: "host", label: "Build no host" },
                                    { value: "cd", label: "CD · GitHub Actions" },
                                ]}
                                value={method}
                                onChange={setMethod}
                            />
                        </Field>
                        <p className="text-sm text-muted-foreground">
                            A operação roda no servidor e continua após fechar a tela; o andamento fica no histórico abaixo.
                        </p>
                        <Button className="gap-1.5" disabled={busy} onClick={() => setConfirming(true)}>
                            <Rocket className="h-4 w-4" aria-hidden /> Publicar versão
                        </Button>
                    </CardContent>
                </Card>
                <OperationsHistory operations={data.operations} />
            </div>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Publicar versão?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A ação altera os containers de {environment.name} e continua no servidor após fechar a tela. Não há
                            restauração automática do banco.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(event) => {
                                event.preventDefault()
                                submit()
                            }}
                        >
                            Confirmar publicação
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
