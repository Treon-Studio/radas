import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
	return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}
export function kFormatter(num: number) {
	const absNum = Math.abs(num);
	const sign = Math.sign(num);

	if (absNum >= 1000000000) {
		return sign * parseFloat((absNum / 1000000000).toFixed(1)) + "B+";
	} else if (absNum >= 1000000) {
		return sign * parseFloat((absNum / 1000000).toFixed(1)) + "M+";
	} else if (absNum >= 1000) {
		return sign * parseFloat((absNum / 1000).toFixed(1)) + "K+";
	}
	return sign * absNum;
}

export const baseUrl =
	process.env.NODE_ENV === "development" || !process.env.VERCEL_URL
		? new URL("http://localhost:3000")
		: new URL(`https://${process.env.VERCEL_URL}`);
export function formatDate(date: Date) {
	let d = new Date(date);
	return d
		.toLocaleDateString("en-US", { month: "short", day: "numeric" })
		.replace(",", "");
}



// Tremor Raw focusInput [v0.0.1]

export const focusInput = [
	// base
	"focus:ring-2",
	// ring color
	"focus:ring-blue-200 focus:dark:ring-blue-700/30",
	// border color
	"focus:border-blue-500 focus:dark:border-blue-700",
  ]
  
  // Tremor Raw focusRing [v0.0.1]
  
  export const focusRing = [
	// base
	"outline outline-offset-2 outline-0 focus-visible:outline-2",
	// outline color
	"outline-blue-500 dark:outline-blue-500",
  ]
  
  // Tremor Raw hasErrorInput [v0.0.1]
  
  export const hasErrorInput = [
	// base
	"ring-2",
	// border color
	"border-red-500 dark:border-red-700",
	// ring color
	"ring-red-200 dark:ring-red-700/30",
  ]
  
  interface CurrencyParams {
	number: number
	maxFractionDigits?: number
	currency?: string
  }
  
  interface PercentageParams {
	number: number
	decimals?: number
  }
  
  interface MillionParams {
	number: number
	decimals?: number
  }
  
  type FormatterFunctions = {
	currency: (params: CurrencyParams) => string
	unit: (number: number) => string
	percentage: (params: PercentageParams) => string
	million: (params: MillionParams) => string
  }
  
  export const formatters: FormatterFunctions = {
	currency: ({
	  number,
	  maxFractionDigits = 2,
	  currency = "USD",
	}: CurrencyParams): string => {
	  return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		maximumFractionDigits: maxFractionDigits,
	  }).format(number)
	},
  
	unit: (number: number): string => {
	  return new Intl.NumberFormat("en-US", {
		style: "decimal",
	  }).format(number)
	},
  
	percentage: ({ number, decimals = 1 }: PercentageParams): string => {
	  return new Intl.NumberFormat("en-US", {
		style: "percent",
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	  }).format(number)
	},
  
	million: ({ number, decimals = 1 }: MillionParams): string => {
	  return `${new Intl.NumberFormat("en-US", {
		style: "decimal",
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	  }).format(number)}M`
	},
  }
  