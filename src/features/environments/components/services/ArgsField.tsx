"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import { joinCommandLine, splitCommandLine } from "../../service-overrides"

type Mode = "line" | "args"
const MODE_OPTIONS = [
    { value: "line", label: "Linha de comando", title: "Texto único: espaços separam, aspas agrupam" },
    { value: "args", label: "Um argumento por linha", title: "Forma exec, sem shell: cada linha é um argumento" },
] as const

/**
 * `command`/`entrypoint` (OPE-211), gravados na forma exec: como uma linha de comando (dividida como o compose
 * faz) ou um argumento por linha. Vazio = o padrão da imagem (`!reset` no override).
 */
export function ArgsField({ id, label, value, onChange }: { id: string; label: string; value: string[]; onChange: (value: string[]) => void }) {
    const [mode, setMode] = useState<Mode>("line")
    // Rascunho da linha: dividir e juntar a cada tecla comeria o espaço que acabou de ser digitado.
    const [line, setLine] = useState(() => joinCommandLine(value))
    const changeMode = (next: Mode) => {
        if (next === "line") setLine(joinCommandLine(value))
        setMode(next)
    }
    return (
        <div className="space-y-2">
            <OptionTabs<Mode> aria-label={`Formato de ${label}`} options={MODE_OPTIONS} value={mode} onChange={changeMode} size="xs" className="w-full" />
            {mode === "line" ? (
                <Input
                    id={id}
                    aria-label={label}
                    spellCheck={false}
                    className="font-mono"
                    placeholder="npm run start -- --port 3000"
                    value={line}
                    onChange={(event) => {
                        setLine(event.target.value)
                        onChange(splitCommandLine(event.target.value))
                    }}
                />
            ) : (
                <Textarea
                    id={id}
                    aria-label={label}
                    spellCheck={false}
                    className="min-h-20 w-full resize-y whitespace-pre font-mono text-xs"
                    placeholder={"sh\n-c\nnpm start"}
                    value={value.join("\n")}
                    onChange={(event) => onChange(event.target.value === "" ? [] : event.target.value.split("\n"))}
                />
            )}
            <p className="text-xs text-muted-foreground">Vazio = o padrão da imagem.{value.length ? ` ${value.length} argumento(s).` : ""}</p>
        </div>
    )
}
