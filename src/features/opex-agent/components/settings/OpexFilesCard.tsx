"use client"

import { Controller, type FieldPath, type FieldValues, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OPEX_FILE_SIZE_MB_MAX, OPEX_FILES_PER_MESSAGE_MAX } from "../../constants"
import type { OpexFilesSettings } from "../../schemas"

const DEFAULT_DESCRIPTION =
    "Imagens e PDFs vão para o modelo quando o provedor lê o tipo (Gemini também lê áudio e vídeo; DeepSeek só texto). Textos e códigos vão como texto. Os demais o agente pode anexar a tarefas e prévias."

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value))

/** Limites dos arquivos enviados no chat. */
export function OpexFilesCard<T extends FieldValues & { files: OpexFilesSettings }>({ form, description = DEFAULT_DESCRIPTION }: { form: UseFormReturn<T>; description?: string }) {
    const errors = (form.formState.errors as { files?: { maxPerMessage?: { message?: string }; maxSizeMb?: { message?: string } } }).files
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Arquivos no chat</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className={FORM_GRID_WIDE}>
                    <Field id="opex-files-max" label="Arquivos por mensagem" error={errors?.maxPerMessage?.message}>
                        <Controller
                            control={form.control}
                            name={"files.maxPerMessage" as FieldPath<T>}
                            render={({ field }) => <Input id="opex-files-max" type="number" step={1} min={1} max={OPEX_FILES_PER_MESSAGE_MAX} value={Number.isNaN(field.value) ? "" : field.value} onChange={(event) => field.onChange(toNumber(event.target.value))} />}
                        />
                    </Field>
                    <Field id="opex-files-size" label="Tamanho máximo por arquivo (MB)" error={errors?.maxSizeMb?.message}>
                        <Controller
                            control={form.control}
                            name={"files.maxSizeMb" as FieldPath<T>}
                            render={({ field }) => <Input id="opex-files-size" type="number" step={0.5} min={0.1} max={OPEX_FILE_SIZE_MB_MAX} value={Number.isNaN(field.value) ? "" : field.value} onChange={(event) => field.onChange(toNumber(event.target.value))} />}
                        />
                        <p className="text-xs text-muted-foreground">Até {OPEX_FILE_SIZE_MB_MAX} MB: o limite dos anexos de tarefa. O arquivo vai direto ao Storage S3.</p>
                    </Field>
                </div>
            </CardContent>
        </Card>
    )
}
