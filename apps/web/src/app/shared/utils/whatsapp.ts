/**
 * WhatsApp click-to-chat links (official wa.me format). These only open WhatsApp
 * with a pre-filled message; nothing is sent automatically.
 */

/** Opens WhatsApp's "choose a chat" screen with the text pre-filled. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Opens a chat with a specific number (E.164, e.g. +919876543210). */
export function whatsappChatUrl(phoneE164: string, text?: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
