/**
 * Normalize 12-word passphrase for consistent hashing
 * Must match server-side normalization exactly
 */

import { bytesToBase64 } from './encoding';

/**
 * Normalize passphrase words
 * - Convert to lowercase
 * - Trim whitespace
 * - Single space between words
 * - Remove any extra characters
 */
export function normalizeWords(words: string): string {
  return words
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 0)
    .join(' ');
}

/**
 * Validate that input appears to be 12 words
 */
export function validateWordCount(words: string): boolean {
  const normalized = normalizeWords(words);
  const wordList = normalized.split(' ');
  return wordList.length === 12;
}

/**
 * Parse words from various input formats
 * Handles comma-separated, newline-separated, etc.
 */
export function parseWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[,\n\r\t]+/g, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 0);
}

/**
 * Compute SHA-256 hash of normalized words
 * Used for server-side authentication
 */
export async function hashWords(normalizedWords: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedWords);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = new Uint8Array(hashBuffer);
  return bytesToBase64(hashArray);
}
