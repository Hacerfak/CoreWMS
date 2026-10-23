import * as React from "react"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

const MONTHS = [
    { label: "Jan", full: "Janeiro", value: "01" },
    { label: "Fev", full: "Fevereiro", value: "02" },
    { label: "Mar", full: "Março", value: "03" },
    { label: "Abr", full: "Abril", value: "04" },
    { label: "Mai", full: "Maio", value: "05" },
    { label: "Jun", full: "Junho", value: "06" },
    { label: "Jul", full: "Julho", value: "07" },
    { label: "Ago", full: "Agosto", value: "08" },
    { label: "Set", full: "Setembro", value: "09" },
    { label: "Out", full: "Outubro", value: "10" },
    { label: "Nov", full: "Novembro", value: "11" },
    { label: "Dez", full: "Dezembro", value: "12" },
]

interface MonthPickerProps {
    value: string | undefined // Exemplo: "10/2026"
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    className?: string
}

export function MonthPicker({
    value,
    onChange,
    placeholder = "Selecione a competência...",
    disabled = false,
    className,
}: MonthPickerProps) {
    const [open, setOpen] = React.useState(false)

    // Extrai mês e ano do valor atual (MM/YYYY)
    const parsed = React.useMemo(() => {
        if (!value || !value.includes("/")) {
            const now = new Date()
            return { month: String(now.getMonth() + 1).padStart(2, "0"), year: now.getFullYear(), hasValue: false }
        }
        const [m, y] = value.split("/")
        const yNum = parseInt(y, 10)
        return {
            month: m.padStart(2, "0"),
            year: isNaN(yNum) ? new Date().getFullYear() : yNum,
            hasValue: true,
        }
    }, [value])

    const [currentYear, setCurrentYear] = React.useState(parsed.year)

    React.useEffect(() => {
        if (parsed.hasValue) {
            setCurrentYear(parsed.year)
        }
    }, [parsed.year, parsed.hasValue])

    const handleSelectMonth = (monthVal: string) => {
        onChange(`${monthVal}/${currentYear}`)
        setOpen(false)
    }

    const handleSetCurrentMonth = () => {
        const now = new Date()
        const mStr = String(now.getMonth() + 1).padStart(2, "0")
        onChange(`${mStr}/${now.getFullYear()}`)
        setCurrentYear(now.getFullYear())
        setOpen(false)
    }

    const selectedMonthObj = MONTHS.find((m) => m.value === parsed.month)
    const displayLabel = parsed.hasValue && selectedMonthObj
        ? `${selectedMonthObj.full} de ${parsed.year}`
        : null

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        "h-9 justify-start text-left font-normal bg-white border-slate-200 text-xs px-3 shadow-2xs hover:bg-slate-50 w-full",
                        !parsed.hasValue && "text-slate-400",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-blue-600 shrink-0" />
                    {displayLabel ? (
                        <span className="font-semibold text-slate-800">{displayLabel}</span>
                    ) : (
                        <span>{placeholder}</span>
                    )}
                    {parsed.hasValue && !disabled && (
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation()
                                onChange("")
                            }}
                            className="ml-auto p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                            <X className="h-3 w-3" />
                        </div>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 bg-white border-slate-200 shadow-xl rounded-xl" align="start">
                <div className="space-y-3">
                    {/* Cabeçalho de Navegação de Ano */}
                    <div className="flex items-center justify-between px-1">
                        <span className="text-sm font-bold text-slate-800">{currentYear}</span>
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-500 hover:text-slate-900"
                                onClick={() => setCurrentYear((y) => y - 1)}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-500 hover:text-slate-900"
                                onClick={() => setCurrentYear((y) => y + 1)}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Grade de 12 Meses */}
                    <div className="grid grid-cols-3 gap-1.5">
                        {MONTHS.map((m) => {
                            const isSelected = parsed.hasValue && parsed.month === m.value && parsed.year === currentYear
                            return (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => handleSelectMonth(m.value)}
                                    className={cn(
                                        "h-9 rounded-lg text-xs font-medium transition-colors flex items-center justify-center",
                                        isSelected
                                            ? "bg-blue-600 text-white font-bold shadow-xs hover:bg-blue-700"
                                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                                    )}
                                >
                                    {m.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Rodapé com Atalho do Mês Vigente */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleSetCurrentMonth}
                            className="h-7 text-[11px] text-blue-600 hover:text-blue-700 px-2"
                        >
                            Mês Atual
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                onChange("")
                                setOpen(false)
                            }}
                            className="h-7 text-[11px] text-slate-400 hover:text-slate-600 px-2"
                        >
                            Limpar
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}