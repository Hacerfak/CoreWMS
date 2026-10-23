import * as React from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon, X } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps {
    date: DateRange | undefined
    setDate: (date: DateRange | undefined) => void
    className?: string
}

export function DateRangePicker({
    date,
    setDate,
    className,
}: DateRangePickerProps) {
    return (
        <div className={cn("grid gap-2", className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant="outline"
                        className={cn(
                            "h-9 justify-start text-left font-normal bg-white border-slate-200 text-xs px-3 shadow-2xs hover:bg-slate-50",
                            !date && "text-slate-400"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-blue-600 shrink-0" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                                    {format(date.to, "dd/MM/yyyy", { locale: ptBR })}
                                </>
                            ) : (
                                format(date.from, "dd/MM/yyyy", { locale: ptBR })
                            )
                        ) : (
                            <span>Selecione um período...</span>
                        )}
                        {date?.from && (
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDate(undefined);
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
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={1}
                        locale={ptBR}
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}