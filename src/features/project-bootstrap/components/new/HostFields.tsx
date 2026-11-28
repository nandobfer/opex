"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { apiErrorMessage } from "@/lib/api"
import { BoardColumnPicker } from "@/features/tasks/components/BoardColumnPicker"
import type { BoardColumnView } from "@/features/tasks/board"
import { directoryTone } from "../../form-state"
import type { ProjectBootstrapStartInput, ProjectBootstrapStartValues } from "../../schemas"
import type { DirectoryCheckDto } from "../../types"
import { CheckStatus } from "./CheckStatus"

interface HostFieldsProps {
    form: UseFormReturn<ProjectBootstrapStartInput, unknown, ProjectBootstrapStartValues>
    columns: readonly BoardColumnView[]
    columnsLoading: boolean
    check: { data: DirectoryCheckDto | undefined; isFetching: boolean; error: unknown }
    pending: boolean
    onDirectoryEdited: () => void
}

/** Diretório no host (com a conferência ao vivo) e as colunas de entrada e de conclusão do vínculo. */
export function HostFields({ form, columns, columnsLoading, check, pending, onDirectoryEdited }: HostFieldsProps) {
    const errors = form.formState.errors
    const result = check.data
    const tone = pending || check.isFetching ? "loading" : check.error ? "blocked" : directoryTone(result)
    const message = pending || check.isFetching ? "Conferindo a pasta no host…" : check.error ? apiErrorMessage(check.error, "Não foi possível conferir a pasta no host") : result ? [result.reason, result.message].filter(Boolean).join(" ") : null
    const directory = form.register("directory")
    return (
        <div className="space-y-4">
            <Field id="bootstrap-directory" label="Diretório no host" error={errors.directory?.message}>
                <Input
                    id="bootstrap-directory"
                    className="font-mono"
                    autoComplete="off"
                    {...directory}
                    onChange={(event) => {
                        onDirectoryEdited()
                        void directory.onChange(event)
                    }}
                    aria-invalid={errors.directory ? true : undefined}
                    aria-describedby="bootstrap-directory-status"
                />
            </Field>
            <div className="-mt-2">
                <CheckStatus id="bootstrap-directory-status" tone={errors.directory ? null : tone} message={errors.directory ? null : message} />
            </div>
            <div className={FORM_GRID}>
                <Field id="bootstrap-entry-column" label="Coluna de entrada" error={errors.entryColumnKey?.message}>
                    <Controller
                        control={form.control}
                        name="entryColumnKey"
                        render={({ field }) => (
                            <BoardColumnPicker id="bootstrap-entry-column" columns={columns} value={field.value || null} onChange={(key) => field.onChange(key ?? "")} loading={columnsLoading} invalid={Boolean(errors.entryColumnKey)} placeholder="Escolha a coluna" searchLabel="Buscar coluna" />
                        )}
                    />
                </Field>
                <Field id="bootstrap-closed-column" label="Coluna de conclusão">
                    <Controller
                        control={form.control}
                        name="closedColumnKey"
                        render={({ field }) => (
                            <BoardColumnPicker id="bootstrap-closed-column" columns={columns} value={field.value ?? null} onChange={field.onChange} placeholder="Sem coluna de conclusão" searchLabel="Buscar coluna de conclusão" noneLabel="Sem coluna de conclusão" />
                        )}
                    />
                </Field>
            </div>
        </div>
    )
}
