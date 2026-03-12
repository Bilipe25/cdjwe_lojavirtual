import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a robust WhatsApp link from a phone number string.
 * Automatically adds the Brazilian country code (+55) if missing 
 * for 11 or 10 digit numbers (DD + Number).
 */
export function getWhatsAppLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  
  if (!digits) return null
  
  // If it's 10 or 11 digits (Brazilian DD + Number), prepend 55
  if (digits.length === 10 || digits.length === 11) {
    return `https://wa.me/55${digits}`
  }
  
  // Otherwise assume it's already a full international number or other format
  return `https://wa.me/${digits}`
}

/**
 * Fetches an image from a URL and converts it to a base64 string.
 * Useful for embedding remote images in pdfmake documents.
 */
export async function getBase64ImageFromURL(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('Error converting image to base64:', error)
    return null
  }
}
