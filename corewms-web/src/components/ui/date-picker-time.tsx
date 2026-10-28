import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon, Clock, X } from "lucide-react"

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

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))

function maskDateInput(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 8)
    if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
}

function parseMaskedDate(maskedVal: string): Date | null {
    const digits = maskedVal.replace(/\D/g, "")
    if (digits.length !== 8) return null
    const day = parseInt(digits.slice(0, 2), 10)
    const month = parseInt(digits.slice(2, 4), 10)
    const year = parseInt(digits.slice(4, 8), 10)
    if (month < 1 || month > 12 || year < START_YEAR || year > END_YEAR) return null
    const testDate = new Date(year, month - 1, day, 0, 0, 0, 0)
    if (testDate.getFullYear() === year && testDate.getMonth() === month - 1 && testDate.getDate() === day) {
        return testDate
    }
    return null
}

function maskTimeInput(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 4)
    if (digits.length > 2) return `${digits.slice(0, 2)}:${digits.slice(2)}`
    return digits
}

function parseMaskedTime(maskedVal: string): { hours: number; minutes: number } | null {
    const digits = maskedVal.replace(/\D/g, "")
    if (digits.length !== 4) return null
    const hours = parseInt(digits.slice(0, 2), 10)
    const minutes = parseInt(digits.slice(2, 4), 10)
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
    return { hours, minutes }
}

interface DatePickerTimeProps {
    date: Date | string | undefined
    setDate: (date: Date | undefined) => void
    placeholderDate?: string
    placeholderTime?: string
    disabled?: boolean
    className?: string
}

export function DatePickerTime({
    date,
    setDate,
    placeholderDate = "DD/MM/AAAA",
    placeholderTime = "HH:mm",
    disabled = false,
    className,
}: DatePickerTimeProps) {
    const [dateOpen, setDateOpen] = React.useState(false)
    const [timeOpen, setTimeOpen] = React.useState(false)

    const hourContainerRef = React.useRef<HTMLDivElement>(null)
    const minuteContainerRef = React.useRef<HTMLDivElement>(null)
    const hasInitialScrolledRef = React.useRef(false)

    const parsedDateTime = React.useMemo(() => {
        if (!date) return undefined
        if (date instanceof Date) {
            return isNaN(date.getTime()) ? undefined : date
        }

        const str = String(date).trim()
        if (str.includes("T")) {
            const [datePart, timePart] = str.split("T")
            const dParts = datePart.split("-").map(Number)
            if (dParts.length === 3) {
                const tParts = (timePart || "00:00").split(":").map(Number)
                const d = new Date(
                    dParts[0],
                    dParts[1] - 1,
                    dParts[2],
                    tParts[0] || 0,
                    tParts[1] || 0,
                    0,
                    0
                )
                return isNaN(d.getTime()) ? undefined : d
            }
        }

        const rawDateOnly = str.split("-").map(Number)
        if (rawDateOnly.length === 3) {
            const d = new Date(rawDateOnly[0], rawDateOnly[1] - 1, rawDateOnly[2], 12, 0, 0, 0)
            return isNaN(d.getTime()) ? undefined : d
        }

        const fallback = new Date(str)
        return isNaN(fallback.getTime()) ? undefined : fallback
    }, [date])

    const [inputDate, setInputDate] = React.useState(() => {
        return parsedDateTime ? format(parsedDateTime, "dd/MM/yyyy") : ""
    })

    const [inputTime, setInputTime] = React.useState(() => {
        return parsedDateTime ? format(parsedDateTime, "HH:mm") : "12:00"
    })

    const [viewDate, setViewDate] = React.useState<Date>(() => {
        return parsedDateTime || new Date()
    })

    const safeViewDate = React.useMemo(() => {
        return viewDate instanceof Date && !isNaN(viewDate.getTime()) ? viewDate : new Date()
    }, [viewDate])

    React.useEffect(() => {
        if (parsedDateTime) {
            setInputDate(format(parsedDateTime, "dd/MM/yyyy"))
            setInputTime(format(parsedDateTime, "HH:mm"))
            setViewDate(parsedDateTime)
        } else {
            setInputDate("")
        }
    }, [parsedDateTime])

    // Posiciona no horário selecionado apenas ao abrir o popover, sem mover ao clicar/selecionar
    React.useEffect(() => {
        if (timeOpen) {
            if (!hasInitialScrolledRef.current) {
                hasInitialScrolledRef.current = true
                const [curH, curM] = inputTime.split(":")
                const hIndex = Number(curH) || 0
                const mIndex = Number(curM) || 0

                requestAnimationFrame(() => {
                    if (hourContainerRef.current) {
                        const el = hourContainerRef.current.children[hIndex] as HTMLElement
                        if (el) hourContainerRef.current.scrollTop = Math.max(0, el.offsetTop - 8)
                    }
                    if (minuteContainerRef.current) {
                        const el = minuteContainerRef.current.children[mIndex] as HTMLElement
                        if (el) minuteContainerRef.current.scrollTop = Math.max(0, el.offsetTop - 8)
                    }
                })
            }
        } else {
            hasInitialScrolledRef.current = false
        }
    }, [timeOpen])

    const emitChange = (d: Date | null, timeStr: string) => {
        if (!d) {
            setDate(undefined)
            return
        }

        const timeParsed = parseMaskedTime(timeStr)
        const hours = timeParsed ? timeParsed.hours : 12
        const minutes = timeParsed ? timeParsed.minutes : 0

        const combined = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            hours,
            minutes,
            0,
            0
        )

        setDate(combined)
    }

    // -------------------------------------------------------------
    // CONTROLES DE DATA
    // -------------------------------------------------------------
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const masked = maskDateInput(e.target.value)
        setInputDate(masked)

        if (masked.length === 10) {
            const parsed = parseMaskedDate(masked)
            if (parsed) {
                setViewDate(parsed)
                emitChange(parsed, inputTime)
            }
        } else if (masked.length === 0) {
            emitChange(null, inputTime)
        }
    }

    const handleDateBlur = () => {
        if (!inputDate) {
            emitChange(null, inputTime)
            return
        }

        const parsed = parseMaskedDate(inputDate)
        if (parsed) {
            setViewDate(parsed)
            setInputDate(format(parsed, "dd/MM/yyyy"))
            emitChange(parsed, inputTime)
        } else if (parsedDateTime) {
            setInputDate(format(parsedDateTime, "dd/MM/yyyy"))
        } else {
            setInputDate("")
            emitChange(null, inputTime)
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
            setInputDate(format(normalized, "dd/MM/yyyy"))
            setViewDate(normalized)
            emitChange(normalized, inputTime)
            setDateOpen(false)
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

    const handleClearDate = (e: React.MouseEvent) => {
        e.stopPropagation()
        setInputDate("")
        emitChange(null, inputTime)
    }

    // -------------------------------------------------------------
    // CONTROLES DE HORÁRIO
    // -------------------------------------------------------------
    const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const masked = maskTimeInput(e.target.value)
        setInputTime(masked)

        if (masked.length === 5) {
            const currentDate = parseMaskedDate(inputDate) || parsedDateTime
            if (currentDate) {
                emitChange(currentDate, masked)
            }
        }
    }

    const handleTimeInputBlur = () => {
        const parsedT = parseMaskedTime(inputTime)
        const currentDate = parseMaskedDate(inputDate) || parsedDateTime

        if (parsedT) {
            const pad = (n: number) => String(n).padStart(2, "0")
            const formatted = `${pad(parsedT.hours)}:${pad(parsedT.minutes)}`
            setInputTime(formatted)
            if (currentDate) emitChange(currentDate, formatted)
        } else {
            setInputTime("12:00")
            if (currentDate) emitChange(currentDate, "12:00")
        }
    }

    const handleSelectHour = (h: string) => {
        const [, currentMinute] = inputTime.split(":")
        const newTime = `${h}:${currentMinute || "00"}`
        setInputTime(newTime)

        const currentDate = parseMaskedDate(inputDate) || parsedDateTime || new Date()
        emitChange(currentDate, newTime)
    }

    const handleSelectMinute = (m: string) => {
        const [currentHour] = inputTime.split(":")
        const newTime = `${currentHour || "12"}:${m}`
        setInputTime(newTime)

        const currentDate = parseMaskedDate(inputDate) || parsedDateTime || new Date()
        emitChange(currentDate, newTime)
    }

    const handleSetCurrentTime = () => {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, "0")
        const nowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`
        setInputTime(nowStr)

        const currentDate = parseMaskedDate(inputDate) || parsedDateTime || now
        emitChange(currentDate, nowStr)
        setTimeOpen(false)
    }

    const [selectedH, selectedM] = inputTime.split(":")

    return (
        <div className={cn("flex items-center gap-2 w-full", className)}>
            {/* 1. SELETOR DE DATA */}
            <div className="relative flex-1 flex items-center">
                <input
                    type="text"
                    disabled={disabled}
                    placeholder={placeholderDate}
                    value={inputDate}
                    onChange={handleDateChange}
                    onBlur={handleDateBlur}
                    className={cn(
                        "h-9 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-16 text-xs text-slate-800 placeholder:text-slate-400 font-mono shadow-2xs transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
                    )}
                />

                <div className="absolute right-1.5 flex items-center gap-1">
                    {inputDate && !disabled && (
                        <button
                            type="button"
                            onClick={handleClearDate}
                            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            title="Limpar data"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}

                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
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
                                selected={parsedDateTime}
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

            {/* 2. SELETOR DE HORÁRIO */}
            <div className="relative w-28 shrink-0 flex items-center">
                <input
                    type="text"
                    disabled={disabled}
                    placeholder={placeholderTime}
                    value={inputTime}
                    onChange={handleTimeInputChange}
                    onBlur={handleTimeInputBlur}
                    className={cn(
                        "h-9 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs text-slate-800 placeholder:text-slate-400 font-mono shadow-2xs transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
                    )}
                />

                <div className="absolute right-1.5 flex items-center">
                    <Popover open={timeOpen} onOpenChange={setTimeOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                disabled={disabled}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed"
                                title="Selecionar horário"
                            >
                                <Clock className="h-4 w-4 text-blue-600" />
                            </button>
                        </PopoverTrigger>

                        <PopoverContent
                            align="end"
                            className="w-48 p-2.5 bg-white border-slate-200 shadow-xl rounded-xl"
                            onWheel={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                <span className="text-[11px] font-bold uppercase text-slate-500 font-mono tracking-wider">
                                    Horário ({inputTime})
                                </span>
                                <button
                                    type="button"
                                    onClick={handleSetCurrentTime}
                                    className="text-[10px] text-blue-600 hover:text-blue-700 font-bold hover:underline"
                                >
                                    Agora
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                <div>
                                    <span className="text-[10px] font-semibold text-slate-400 block mb-1">Hora</span>
                                    <div
                                        ref={hourContainerRef}
                                        onWheel={(e) => e.stopPropagation()}
                                        className="h-48 overflow-y-auto overscroll-contain space-y-0.5 pr-1 select-none"
                                    >
                                        {HOURS.map((h) => {
                                            const isSelected = h === selectedH
                                            return (
                                                <button
                                                    key={h}
                                                    type="button"
                                                    onClick={() => handleSelectHour(h)}
                                                    className={cn(
                                                        "w-full h-7 rounded text-xs font-mono font-medium transition-colors flex items-center justify-center",
                                                        isSelected
                                                            ? "bg-blue-600 text-white font-bold"
                                                            : "text-slate-700 hover:bg-slate-100"
                                                    )}
                                                >
                                                    {h}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] font-semibold text-slate-400 block mb-1">Min</span>
                                    <div
                                        ref={minuteContainerRef}
                                        onWheel={(e) => e.stopPropagation()}
                                        className="h-48 overflow-y-auto overscroll-contain space-y-0.5 pr-1 select-none"
                                    >
                                        {MINUTES.map((m) => {
                                            const isSelected = m === selectedM
                                            return (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => handleSelectMinute(m)}
                                                    className={cn(
                                                        "w-full h-7 rounded text-xs font-mono font-medium transition-colors flex items-center justify-center",
                                                        isSelected
                                                            ? "bg-blue-600 text-white font-bold"
                                                            : "text-slate-700 hover:bg-slate-100"
                                                    )}
                                                >
                                                    {m}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </div>
    )
}