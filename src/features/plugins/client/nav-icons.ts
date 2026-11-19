import { BarChart3, Blocks, Bot, Calendar, ClipboardList, FileText, LayoutDashboard, ListChecks, Puzzle, Settings, Sparkles, Users, Wrench, type LucideIcon } from "lucide-react"

/**
 * Ícones aceitos no `nav` do manifesto (OPE-172). Nome fora da lista usa `Puzzle` (o menu precisa do
 * ícone na hora, sem carregar o pacote inteiro de ícones).
 */
export const PLUGIN_NAV_ICONS: Record<string, LucideIcon> = { BarChart3, Blocks, Bot, Calendar, ClipboardList, FileText, LayoutDashboard, ListChecks, Puzzle, Settings, Sparkles, Users, Wrench }

export const pluginNavIcon = (name: string): LucideIcon => PLUGIN_NAV_ICONS[name] ?? Puzzle
