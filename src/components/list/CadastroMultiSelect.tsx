"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { LucideIcon, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useState } from "react"

interface Option {
    value: string
    label: string
}

interface CadastroMultiSelectProps {
    options: Option[]
    selected: string[]
    onSelect: (values: string[]) => void
    placeholder?: string
    renderLabel?: (option: Option) => React.ReactNode
    icon?: LucideIcon
    className?: string
    searchable?: boolean
    searchPlaceholder?: string
    /** Associa o gatilho ao rótulo do formulário (`Label htmlFor`). */
    id?: string
    /** Nome acessível do gatilho quando não há `Label` associado. */
    "aria-label"?: string
}

export function CadastroMultiSelect({ 
    options, 
    selected, 
    onSelect, 
    placeholder = "Selecionar...",
    renderLabel,
    icon: Icon,
    className,
    searchable = false,
    searchPlaceholder = "Buscar...",
    id,
    "aria-label": ariaLabel
}: CadastroMultiSelectProps) {
    const [search, setSearch] = useState("")

    const toggle = (value: string) => {
        if (selected.includes(value)) {
            onSelect(selected.filter(v => v !== value))
        } else {
            onSelect([...selected, value])
        }
    }

    const displayValue = () => {
        if (selected.length === 0) return placeholder
        if (selected.length === 1) return options.find(o => o.value === selected[0])?.label || selected[0]
        return `${selected.length} selecionados`
    }

    const filteredOptions = options.filter(o => 
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.value.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button id={id} aria-label={ariaLabel} variant="outline" className={cn("w-full justify-start h-10 font-normal px-3 transition-all", className)}>
                    <div className="flex items-center gap-2 truncate flex-1">
                        {Icon && <Icon className="h-4 w-4 shrink-0 opacity-50 text-primary" />}
                        <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
                            {displayValue()}
                        </span>
                    </div>
                    {selected.length > 0 && (
                        <Badge variant="secondary" className="h-5 px-1 py-0 text-[10px] font-mono shrink-0 ml-2 bg-primary/10 text-primary border-none">
                            {selected.length}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1" align="start">
                {searchable && (
                    <div className="p-2 border-b mb-1">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground opacity-50" />
                            <Input 
                                placeholder={searchPlaceholder}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-8 pl-7 text-xs"
                            />
                        </div>
                    </div>
                )}
                <div className="max-h-[250px] overflow-y-auto space-y-0.5 custom-scrollbar">
                    {filteredOptions.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground italic">
                            Nenhum resultado
                        </div>
                    ) : (
                        filteredOptions.map((option) => (
                            <div 
                                key={option.value}
                                className="flex items-center space-x-2 p-2 hover:bg-accent rounded-md cursor-pointer transition-colors"
                                onClick={() => toggle(option.value)}
                            >
                                <Checkbox 
                                    checked={selected.includes(option.value)} 
                                    onCheckedChange={() => toggle(option.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex-1 text-xs truncate">
                                    {renderLabel ? renderLabel(option) : option.label}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
