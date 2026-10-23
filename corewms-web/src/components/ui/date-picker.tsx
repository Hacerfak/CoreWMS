import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

const MONTHS = [
    { value: 0, label: "Janeiro" },
    { value: 1, label: "Fevereiro" },
    { value: 2, label: "Março" },
    { value: 3, label: "Abril" },
    { value: 4, label: "Maio" },
    { value: 5, label: "Junho" },
    { value: 6, label: "Julho" },
    { value: 7, label: "Agosto" },
    { value: 8, label: "Setembro" },
    { value: 9, label: "Outubro" },
    { value: 10, label: "Novembro" },
    { value: 11, label: "Dezembro" },
]

const CURRENT_YEAR = new Date().getFullYear()
const START_YEAR = 1940
const END_YEAR = CURRENT_YEAR + 30
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i)

function maskDateInput(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 8)
    if (digits.length > 4) {
        return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    }
    if (digits.length > 2) {
        return `${digits.slice(0, 2)}/${digits.slice(2)}`
    }
    return digits
}

function parseMaskedDate(maskedVal: string): Date | null {
    const digits = maskedVal.replace(/\D/g, "")
    if (digits.length !== 8) return null

    const day = parseInt(digits.slice(0, 2), 10)
    const month = parseInt(digits.slice(2, 4), 10)
    const year = parseInt(digits.slice(4, 8), 10)

    if (month < 1 || month > 12 || year < START_YEAR || year > END_YEAR) {
        return null
    }

    const testDate = new Date(year, month - 1, day, 0, 0, 0, 0)
    if (
        testDate.getFullYear() === year &&
        testDate.getMonth() === month - 1 &&
        testDate.getDate() === day
    ) {
        return testDate
    }

    return null
}

interface DatePickerProps {
    date: Date | string | undefined
    setDate: (date: Date | undefined) => void
    placeholder?: string
    disabled?: boolean
    className?: string
}

export function DatePicker({
    date,
    setDate,
    placeholder = "DD/MM/AAAA",
    disabled = false,
    className,
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false)

    // Validação estrita para garantir um objeto Date válido
    const parsedDate = React.useMemo(() => {
        if (!date) return undefined
        if (date instanceof Date) {
            return isNaN(date.getTime()) ? undefined : date
        }

        const rawStr = String(date).split("T")[0]
        const parts = rawStr.split("-")
        if (parts.length === 3) {
            const y = parseInt(parts[0], 10)
            const m = parseInt(parts[1], 10) - 1
            const d = parseInt(parts[2], 10)
            const valid = new Date(y, m, d, 0, 0, 0, 0)
            return isNaN(valid.getTime()) ? undefined : valid
        }

        const fallback = new Date(date)
        return isNaN(fallback.getTime()) ? undefined : fallback
    }, [date])

    const [inputValue, setInputValue] = React.useState(() => {
        return parsedDate ? format(parsedDate, "dd/MM/yyyy") : ""
    })

    const [viewDate, setViewDate] = React.useState<Date>(() => {
        return parsedDate || new Date()
    })

    // Garante sempre uma instância segura de Date para o cabeçalho
    const safeViewDate = React.useMemo(() => {
        return viewDate instanceof Date && !isNaN(viewDate.getTime()) ? viewDate : new Date()
    }, [viewDate])

    React.useEffect(() => {
        if (parsedDate) {
            setInputValue(format(parsedDate, "dd/MM/yyyy"))
            setViewDate(parsedDate)
        } else {
            setInputValue("")
        }
    }, [parsedDate])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const masked = maskDateInput(e.target.value)
        setInputValue(masked)

        if (masked.length === 10) {
            const parsed = parseMaskedDate(masked)
            if (parsed) {
                setDate(parsed)
                setViewDate(parsed)
            }
        } else if (masked.length === 0) {
            setDate(undefined)
        }
    }

    const handleInputBlur = () => {
        if (!inputValue) {
            setDate(undefined)
            return
        }

        const parsed = parseMaskedDate(inputValue)
        if (parsed) {
            setDate(parsed)
            setViewDate(parsed)
            setInputValue(format(parsed, "dd/MM/yyyy"))
        } else if (parsedDate) {
            setInputValue(format(parsedDate, "dd/MM/yyyy"))
        } else {
            setInputValue("")
            setDate(undefined)
        }
    }

    const handleSelectDay = (selectedDay: Date | undefined) => {
        if (selectedDay && !isNaN(selectedDay.getTime())) {
            const normalized = new Date(
                selectedDay.getFullYear(),
                selectedDay.getMonth(),
                selectedDay.getDate(),
                0, 0, 0, 0
            )
            setDate(normalized)
            setInputValue(format(normalized, "dd/MM/yyyy"))
            setViewDate(normalized)
            setOpen(false)
        }
    }

    const handleMonthSelect = (mIndex: number) => {
        const next = new Date(safeViewDate.getFullYear(), mIndex, 1, 0, 0, 0, 0)
        setViewDate(next)
    }

    const handleYearSelect = (yVal: number) => {
        const next = new Date(yVal, safeViewDate.getMonth(), 1, 0, 0, 0, 0)
        setViewDate(next)
    }

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation()
        setInputValue("")
        setDate(undefined)
    }

    return (
        <div className={cn("relative flex items-center w-full", className)}>
            <input
                type="text"
                disabled={disabled}
                placeholder={placeholder}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                className={cn(
                    "h-9 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-16 text-xs text-slate-800 placeholder:text-slate-400 font-mono shadow-2xs transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
                )}
            />

            <div className="absolute right-1.5 flex items-center gap-1">
                {inputValue && !disabled && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        title="Limpar data"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}

                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            disabled={disabled}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed"
                            title="Abrir calendário"
                        >
                            <CalendarIcon className="h-4 w-4 text-blue-600" />
                        </button>
                    </PopoverTrigger>

                    <PopoverContent align="end" className="w-auto p-3 bg-white border-slate-200 shadow-xl rounded-xl">
                        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                            <select
                                value={safeViewDate.getMonth()}
                                onChange={(e) => handleMonthSelect(Number(e.target.value))}
                                className="h-7 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-md px-2 py-0 text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                            >
                                {MONTHS.map((m) => (
                                    <option key={m.value} value={m.value}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={safeViewDate.getFullYear()}
                                onChange={(e) => handleYearSelect(Number(e.target.value))}
                                className="h-7 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-md px-2 py-0 text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                            >
                                {YEARS.map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <Calendar
                            mode="single"
                            selected={parsedDate}
                            onSelect={handleSelectDay}
                            month={safeViewDate}
                            onMonthChange={setViewDate}
                            initialFocus
                            locale={ptBR}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    )
}