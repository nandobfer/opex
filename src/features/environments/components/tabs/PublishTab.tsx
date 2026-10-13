"use client"

import { useState } from "react"
import { Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { usePublish, type AmbientesApi } from "../../hooks"
import type { EnvironmentDto, OperationDto } from "../../types"
import { OperationSteps, OperationSummary } from "../shared"

/** Aba Publicar: inicia uma publicação local (Opex) ou pelo CD (GitHub Actions). */
export function PublishTab({ context, envId, projectId, env, operation }: { context: AmbientesApi; envId: string; projectId: string; env: EnvironmentDto; operation: OperationDto | null }) {
    const [method, setMethod] = useState<"local" | "cd">("local")
    const [branch, setBranch] = useState(env.branch)
    const publish = usePublish(context, envId, projectId)

    const busy = publish.isPending || operation?.status === "running" || operation?.status === "queued"

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Nova publicação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Field id="publish-method" label="Método">
                        <OptionTabs
                            aria-label="Método de publicação"
                            options={[
                                { value: "local", label: "Local (Opex)" },
                                { value: "cd", label: "CD (GitHub Actions)" },
                            ]}
                            value={method}
                            onChange={setMethod}
                        />
                    </Field>
                    <Field id="publish-branch" label="Branch">
                        <Input id="publish-branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" />
                    </Field>
                    {method === "local" && (
                        <p className="text-xs text-muted-foreground">Clonar/atualizar → Build → Checagem do banco → Subir → Healthcheck. Entra na fila global do build.</p>
                    )}
                    {method === "cd" && <p className="text-xs text-muted-foreground">Dispara o workflow de CD configurado e acompanha a execução.</p>}
                    <Button onClick={() => publish.mutate({ method, branch: branch.trim() || undefined })} disabled={busy}>
                        <Rocket className="mr-2 h-4 w-4" aria-hidden />
                        {busy ? "Publicando..." : "Publicar versão"}
                    </Button>
                </CardContent>
            </Card>

            {operation && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Última publicação</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <OperationSummary operation={operation} />
                        <OperationSteps operation={operation} />
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
