import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string): string {
  if (!name) return ''
  const initials = name
    .split(' ')
    .map(word => word[0])
    .filter(initial => !!initial)
    .join('')
  return initials.toUpperCase()
}
