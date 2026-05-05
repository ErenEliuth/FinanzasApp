/**
 * Date utility functions for Colombia timezone (UTC-5).
 * 
 * Problem: new Date().toISOString() produces UTC time.
 * A transaction at 8 PM Colombia (May 4) becomes 2026-05-05T01:00:00.000Z.
 * Supabase strips the 'Z', so when parsed back, it's interpreted as
 * local May 5 at 1 AM, placing the transaction on the WRONG day.
 * 
 * Fix: Always store dates using LOCAL time components (no 'Z' suffix).
 * This ensures the date part is always correct for the user's timezone.
 */

/**
 * Returns the current local date/time as an ISO string WITHOUT the 'Z' suffix.
 * This ensures the date components match the user's local time.
 * 
 * Example: At 8:30 PM Colombia time on May 4:
 *   - new Date().toISOString() → "2026-05-05T01:30:00.000Z"  ❌ (May 5 UTC)
 *   - getLocalISOString()      → "2026-05-04T20:30:00.000"   ✅ (May 4 local)
 */
export function getLocalISOString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000`;
}

/**
 * Returns today's local date as YYYY-MM-DD.
 * 
 * Example: At 8:30 PM Colombia time on May 4:
 *   - new Date().toISOString().split('T')[0] → "2026-05-05"  ❌ (UTC date)
 *   - getLocalDateKey()                       → "2026-05-04"  ✅ (local date)
 */
export function getLocalDateKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Safely parses a date string from the database and returns a Date object
 * in LOCAL time. Handles both ISO strings with/without 'Z' suffix,
 * and plain date strings like "2026-05-04".
 */
export function parseLocalDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    
    // Strip the 'Z' suffix if present to force local time parsing
    const cleaned = dateStr.replace('Z', '');
    
    // If it's just a date (no time), add noon to avoid DST edge cases
    if (!cleaned.includes('T')) {
        return new Date(`${cleaned}T12:00:00`);
    }
    
    return new Date(cleaned);
}
