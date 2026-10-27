"use client"

import type { LocalDockerMode } from "../../schemas"
import type { LocalDockerSettingsDto } from "../../types"
import { KeyCard } from "./KeyCard"
import { PrepareCard } from "./PrepareCard"
import { ScriptCard } from "./ScriptCard"

/** Aba "Preparo do PC": chave do servidor, preparo único do WSL (passo a passo ou script) e preparo do Docker. */
export function SetupTab({ saved, mode, unsaved }: { saved: LocalDockerSettingsDto; mode: LocalDockerMode; unsaved: boolean }) {
    return (
        <>
            <KeyCard keyInfo={saved.key} />
            <ScriptCard mode={mode} hasKey={saved.key.configured} unsaved={unsaved} />
            <PrepareCard lastPrepare={saved.lastPrepare} blocked={unsaved ? "Salve a configuração antes de preparar o PC" : !saved.key.configured ? "Gere ou insira a chave do servidor primeiro" : null} />
        </>
    )
}
