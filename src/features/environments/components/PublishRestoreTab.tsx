"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
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
import type { EnvironmentDetail, ImageDto } from "../types"
import { restoreCompatibility } from "../logic"
import { useEnvironmentOperation } from "../hooks/useEnvironments"
import { VirtualItems } from "./VirtualItems"

export function PublishRestoreTab({
    repoId,
    data,
    restore,
}: {
    repoId: string
    data: EnvironmentDetail
    restore: boolean
}) {
    const [method, setMethod] = useState<"host" | "cd">("host")
    const [selection, setSelection] = useState<ImageDto | null>(null)
    const [confirm, setConfirm] = useState(false)
    const [risk, setRisk] = useState(false)
    const action = useEnvironmentOperation(repoId, data.environment.id)
    const busy = Boolean(data.environment.activeOperationId) || action.isPending
    const compatibility = restoreCompatibility(data.environment.dbVersion, selection?.dbVersion ?? null)
    const unknown = restore && compatibility === "unknown"
    const submit = () => {
        action.mutate(
            {
                kind: restore ? "restore" : "publish",
                method: restore ? "host" : method,
                imageId: selection?.id,
                confirmation: true,
                riskConfirmed: risk,
                expectedRevision: data.environment.revision,
                requestId: crypto.randomUUID(),
            },
            {
                onSuccess: () => {
                    setConfirm(false)
                    setRisk(false)
                },
            },
        )
    }
    return (
        <div className="space-y-5">
            {!restore && (
                <>
                    <OptionTabs
                        options={[
                            { value: "host", label: "Build no host" },
                            { value: "cd", label: "CD · GitHub Actions" },
                        ]}
                        value={method}
                        onChange={setMethod}
                    />
                    <p className="text-sm text-muted-foreground">
                        O agente publicará a branch {data.environment.branch}. Imagens ficam no Docker do host; falha de
                        saúde não provoca rollback automático.
                    </p>
                    <Button disabled={busy} onClick={() => setConfirm(true)}>
                        Publicar versão
                    </Button>
                </>
            )}
            {restore && (
                <>
                    <p className="text-sm text-muted-foreground">
                        Compatibilidade baseada no estado registrado no Opex, sujeito a alterações externas. Trocar
                        imagem não reverte o banco.
                    </p>
                    {!data.images.length && (
                        <p className="rounded-md border border-dashed p-5 text-sm">
                            Nenhuma imagem registrada. Inspecione o host na aba Compose ou publique uma versão.
                        </p>
                    )}
                    <VirtualItems
                        items={data.images}
                        getKey={(image) => image.id}
                        estimate={200}
                        render={(image) => {
                            const status = restoreCompatibility(data.environment.dbVersion, image.dbVersion)
                            return (
                                <article key={image.id} className="space-y-3 rounded-lg border p-4 text-sm">
                                    <h3 className="break-all font-medium">{image.version}</h3>
                                    <p className="text-muted-foreground">
                                        {image.builtAt
                                            ? format(new Date(image.builtAt), "dd/MM/yyyy HH:mm", { locale: ptBR })
                                            : "Data do build desconhecida"}{" "}
                                        · {image.origin} · Banco: {image.dbVersion ?? "desconhecido"}
                                    </p>
                                    <p>
                                        {status === "blocked"
                                            ? "Incompatível com o banco registrado. Restaure o banco antes de usar esta imagem."
                                            : status === "unknown"
                                              ? "Compatibilidade desconhecida: exige confirmação explícita do risco."
                                              : "Compatível com o banco registrado."}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            disabled={busy || status === "blocked"}
                                            variant="outline"
                                            onClick={() => {
                                                setSelection(image)
                                                setRisk(false)
                                                setConfirm(true)
                                            }}
                                        >
                                            Restaurar esta versão
                                        </Button>
                                        {status === "blocked" && (
                                            <Button disabled variant="ghost">
                                                Restaurar banco — Em desenvolvimento
                                            </Button>
                                        )}
                                    </div>
                                </article>
                            )
                        }}
                    />
                </>
            )}
            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{restore ? "Restaurar versão?" : "Publicar versão?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            A ação altera os containers de {data.environment.name} e continua no servidor após fechar a
                            tela. Não há restauração automática do banco.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {unknown && (
                        <label className="flex items-start gap-3 text-sm">
                            <input type="checkbox" checked={risk} onChange={(e) => setRisk(e.target.checked)} />
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
                            Confirmar {restore ? "restauração" : "publicação"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <section className="space-y-3">
                <h3 className="font-semibold">Histórico de operações</h3>
                {!data.operations.length && (
                    <p className="text-sm text-muted-foreground">Nenhuma operação registrada.</p>
                )}
                <VirtualItems
                    items={data.operations}
                    getKey={(op) => op.id}
                    estimate={200}
                    render={(op) => (
                        <article key={op.id} className="space-y-2 rounded-md border p-4 text-sm">
                            <div className="flex flex-wrap justify-between gap-2">
                                <strong>
                                    {op.kind === "publish"
                                        ? "Publicação"
                                        : op.kind === "restore"
                                          ? "Restauração"
                                          : "Inspeção"}
                                </strong>
                                <span>{op.stage}</span>
                            </div>
                            <p className="text-muted-foreground">
                                {format(new Date(op.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </p>
                            {op.error && (
                                <p role="alert" className="text-destructive">
                                    {op.error}
                                </p>
                            )}
                            {op.runUrl && (
                                <a href={op.runUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                                    Ver execução no GitHub
                                </a>
                            )}
                            {op.migrations.length > 0 && <p>Migrações comprovadas: {op.migrations.join(", ")}</p>}
                            <ol className="space-y-1 text-muted-foreground" aria-label="Etapas da operação">
                                {op.steps.map((step, index) => (
                                    <li key={index}>
                                        {format(new Date(step.at), "HH:mm:ss", { locale: ptBR })} · {step.name}
                                    </li>
                                ))}
                            </ol>
                            <ul className="space-y-1 break-words text-muted-foreground">
                                {op.evidence.map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                            </ul>
                        </article>
                    )}
                />
            </section>
        </div>
    )
}
