import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

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
    placeholder = "Selecione uma data...",
    disabled = false,
    className,
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false)

    const parsedDate = React.useMemo(() => {
        if (!date) return undefined
        if (date instanceof Date) return isNaN(date.getTime()) ? undefined : date
        const d = new Date(date)
        return isNaN(d.getTime()) ? undefined : d
    }, [date])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        "h-9 justify-start text-left font-normal bg-white border-slate-200 text-xs px-3 shadow-2xs hover:bg-slate-50 w-full",
                        !parsedDate && "text-slate-400",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-blue-600 shrink-0" />
                    {parsedDate ? (
                        format(parsedDate, "dd/MM/yyyy", { locale: ptBR })
                    ) : (
                        <span>{placeholder}</span>
                    )}
                    {parsedDate && !disabled && (
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation()
                                setDate(undefined)
                            }}
                            className="ml-auto p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                            <X className="h-3 w-3" />
                        </div>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-white border-slate-200 shadow-xl rounded-xl" align="start">
                <Calendar
                    mode="single"
                    selected={parsedDate}
                    onSelect={(selected) => {
                        setDate(selected)
                        setOpen(false)
                    }}
                    initialFocus
                    locale={ptBR}
                />
            </PopoverContent>
        </Popover>
    )
}