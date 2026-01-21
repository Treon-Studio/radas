import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "./utils"
import { Button } from "./button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

interface ComboboxProps {
  value?: string
  onValueChange?: (value: string) => void
  onSearchChange?: (search: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  options: { value: string; label: string; subtitle?: string }[]
  disabled?: boolean
  className?: string
}

export const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  ({
    value,
    onValueChange,
    onSearchChange,
    placeholder = "Select option...",
    searchPlaceholder = "Search...",
    emptyText = "No option found.",
    options,
    disabled = false,
    className,
  }, ref) => {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")

    const selectedOption = options.find((option) => option.value === value)

    const handleSearchChange = (newSearch: string) => {
      setSearch(newSearch)
      onSearchChange?.(newSearch)
    }

    const handleSelect = (selectedValue: string) => {
      onValueChange?.(selectedValue)
      setOpen(false)
      setSearch("")
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between",
              !value && "text-muted-foreground",
              className
            )}
            disabled={disabled}
          >
            {selectedOption ? selectedOption.label : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput 
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={handleSearchChange}
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="flex items-start justify-between cursor-pointer"
                  >
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate">{option.label}</span>
                      {option.subtitle && (
                        <span className="text-sm text-muted-foreground truncate">
                          {option.subtitle}
                        </span>
                      )}
                    </div>
                    <Check
                      className={cn(
                        "ml-2 h-4 w-4 shrink-0",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }
);

Combobox.displayName = "Combobox";