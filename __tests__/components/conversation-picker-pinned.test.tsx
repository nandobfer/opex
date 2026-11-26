/** @vitest-environment happy-dom */
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/evolution-api/components/EvolutionSyncAction", () => ({ EvolutionSyncAction: () => null }))

import { ConversationPicker } from "@/features/evolution-api/components/ConversationPicker"
import { CadastroSearchPicker } from "@/components/list/CadastroSearchPicker"
import type { EvolutionContactDto } from "@/features/evolution-api/types"

const contact = (name: string, number: string): EvolutionContactDto => ({ jid: `${number}@s.whatsapp.net`, name, number, pictureUrl: null, isGroup: false, lastMessageAt: null })
const CONTACTS = [contact("Ana", "5531911110001"), contact("Bruno", "5531911110002"), contact("Carla", "5531911110003"), contact("Caio", "5531911110004")]
const names = () => within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.querySelector("span.font-medium")?.textContent)

function Harness({ initial = [] as string[] }) {
    const [selected, setSelected] = useState(initial)
    return <ConversationPicker items={CONTACTS} selected={selected} onChange={setSelected} placeholder="Escolher contatos e grupos" />
}

afterEach(() => cleanup())

describe("escolhidos no topo dos seletores de contato (OPE-197, D7/D8)", () => {
    it("D7: os escolhidos aparecem primeiro e os demais depois, na ordem recebida", () => {
        render(<Harness initial={[CONTACTS[2]!.jid]} />)
        fireEvent.click(screen.getByRole("button", { name: /Carla/ }))
        expect(names()).toEqual(["Carla", "Ana", "Bruno", "Caio"])
    })

    it("D8: marcar um item o leva ao topo na hora, com a lista aberta", () => {
        render(<Harness />)
        fireEvent.click(screen.getByRole("button", { name: /Escolher contatos/ }))
        expect(names()).toEqual(["Ana", "Bruno", "Carla", "Caio"])
        fireEvent.click(screen.getByRole("option", { name: /Caio/ }))
        expect(names()).toEqual(["Caio", "Ana", "Bruno", "Carla"])
    })

    it("com busca, os escolhidos que casam vêm antes dos demais resultados", () => {
        render(<Harness initial={[CONTACTS[3]!.jid]} />)
        fireEvent.click(screen.getByRole("button", { name: /Caio/ }))
        fireEvent.change(screen.getByRole("textbox", { name: "Buscar por nome ou número" }), { target: { value: "Ca" } })
        expect(names()[0]).toBe("Caio")
        expect(names()).toContain("Carla")
    })

    it("CadastroSearchPicker sem pinSelected mantém a ordem recebida (contrato dos outros filtros)", () => {
        const options = [{ value: "a", label: "A" }, { value: "b", label: "B" }]
        render(<CadastroSearchPicker aria-label="Filtro" options={options} selected={["b"]} onSelect={vi.fn()} />)
        fireEvent.click(screen.getByRole("button", { name: "Filtro" }))
        expect(within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent)).toEqual(["A", "B"])
        cleanup()
        render(<CadastroSearchPicker aria-label="Filtro" options={options} selected={["b"]} onSelect={vi.fn()} pinSelected />)
        fireEvent.click(screen.getByRole("button", { name: "Filtro" }))
        expect(within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent)).toEqual(["B", "A"])
    })
})
