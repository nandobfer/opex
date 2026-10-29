"use client"

import type { LocalDockerMode } from "../../schemas"
import type { LocalDockerSettingsDto } from "../../types"
import { KeyCard } from "./KeyCard"
import { ScriptCard } from "./ScriptCard"

/** Aba "Preparo do PC": chave do servidor e preparo único do WSL (passo a passo ou script). */
export function SetupTab({ saved, mode, unsaved }: { saved: LocalDockerSettingsDto; mode: LocalDockerMode; unsaved: boolean }) {
    return (
        <>
            <KeyCard keyInfo={saved.key} />
            <ScriptCard mode={mode} hasKey={saved.key.configured} unsaved={unsaved} />
        </>
    )
}
