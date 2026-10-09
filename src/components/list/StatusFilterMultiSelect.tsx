"use client"

import { PackageCheck } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { StatusPill } from "@/components/list/StatusPill"

interface StatusFilterMultiSelectProps {
  selected: string[]
  onSelect: (values: string[]) => void
  placeholder?: string
}

export function StatusFilterMultiSelect({
  selected,
  onSelect,
  placeholder = "Todos",
}: StatusFilterMultiSelectProps) {
  return (
    <CadastroMultiSelect
      selected={selected}
      onSelect={onSelect}
      options={[
        { value: "ativo", label: "Ativos" },
        { value: "inativo", label: "Inativos" },
      ]}
      placeholder={placeholder}
      icon={PackageCheck}
      renderLabel={(option) => (
        <StatusPill
          active={option.value === "ativo"}
          activeLabel="Ativo"
          inactiveLabel="Inativo"
        />
      )}
    />
  )
}
