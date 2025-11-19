import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Helper to merge Tailwind classes cleanly
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
