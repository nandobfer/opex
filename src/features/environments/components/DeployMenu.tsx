"use client"

import { useState } from "react"
import { Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { refSchema } from "../schemas"
import type { EnvironmentDto } from "../types"

type Choice = "latest" | "ref"

/** Deploy/Redeploy com a escolha da ref (ou a última da branch salva). */
export function DeployMenu({ env, disabled, reason, onDeploy }: { env: EnvironmentDto; disabled: boolean; reason: string | null; onDeploy: (ref: string) => void }) {
    const [open, setOpen] = useState(false)
    const [choice, setChoice] = useState<Choice>("latest")
    const [ref, setRef] = useState("")
    const central = env.source.kind === "central" ? env.source : null
    const invalid = choice === "ref" && !refSchema.safeParse(ref).success
    const label = env.deployedOn ? "Redeploy" : "Deploy"
    const submit = () => {
        onDeploy(choice === "ref" ? ref.trim() : "")
        setOpen(false)
    }
    if (!central)
        return (
            <Button type="button" size="sm" className="gap-1.5" disabled={disabled} title={reason ?? undefined} onClick={() => onDeploy("")}>
                <Rocket className="h-4 w-4" aria-hidden /> {label}
            </Button>
        )
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" size="sm" className="gap-1.5" disabled={disabled} title={reason ?? undefined}>
                    <Rocket className="h-4 w-4" aria-hidden /> {label}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-3">
                <OptionTabs<Choice> aria-label="Ref do deploy" options={[{ value: "latest", label: `Última de ${central.ref}` }, { value: "ref", label: "Outra ref" }]} value={choice} onChange={setChoice} className="w-full" />
                {choice === "ref" && (
                    <div className="space-y-1">
                        <Label htmlFor={`deploy-ref-${env.id}`}>Branch, tag ou commit</Label>
                        <Input id={`deploy-ref-${env.id}`} className="font-mono" value={ref} onChange={(event) => setRef(event.target.value)} placeholder="feat/minha-branch" />
                    </div>
                )}
                <Button type="button" className="w-full gap-1.5" disabled={invalid} onClick={submit}>
                    <Rocket className="h-4 w-4" aria-hidden /> {label}
                </Button>
            </PopoverContent>
        </Popover>
    )
}
