/**
 * Converts a time string to milliseconds since midnight.
 * Handles formats: "HH:mm:ss", "HH:mm", "HH:mm:ss AM/PM", "HH:mm:ss a. m./p. m."
 */
export function timeToMs(timeStr) {
  if (!timeStr) return 0;
  let t = String(timeStr).trim();
  
  // Handle Spanish AM/PM formats: "p. m.", "a. m.", "p.m.", "a.m."
  const isPM = /p\.?\s*m\.?/i.test(t) || t.toUpperCase().includes('PM');
  const isAM = /a\.?\s*m\.?/i.test(t) || t.toUpperCase().includes('AM');
  
  // Remove all AM/PM variants
  t = t.replace(/[ap]\.?\s*m\.?/gi, '').trim();
  
  const parts = t.split(':');
  let h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  const s = parseInt(parts[2] || '0', 10);
  
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  
  return h * 3600000 + m * 60000 + s * 1000;
}

/**
 * Compares two date strings tolerating different formats and zero-padding.
 * Handles: "DD/MM/YYYY", "YYYY/MM/DD", "MM/DD/YYYY", with / or - separators.
 * Uses heuristic: if first segment > 31, assume YYYY/MM/DD format.
 */
export function matchDate(d1, d2) {
  if (!d1 || !d2) return false;
  
  const normalize = (d) => {
    const parts = String(d).trim().replace(/[\/-]/g, '/').split('/');
    if (parts.length !== 3) return null;
    
    const nums = parts.map(n => parseInt(n, 10));
    
    // Detect YYYY/MM/DD vs DD/MM/YYYY
    if (nums[0] > 31) {
      // YYYY/MM/DD → normalize to DD/MM/YYYY
      return `${nums[2]}/${nums[1]}/${nums[0]}`;
    }
    // Assume DD/MM/YYYY (Latin format)
    return `${nums[0]}/${nums[1]}/${nums[2]}`;
  };
  
  const n1 = normalize(d1);
  const n2 = normalize(d2);
  
  return n1 !== null && n2 !== null && n1 === n2;
}

/**
 * Safely parses a float from a string, handling comma decimals.
 */
export function safeParseFloat(value) {
  if (value === null || value === undefined) return NaN;
  return parseFloat(String(value).replace(',', '.'));
}

export function parseCustomDate(dateStr) {
  if (!dateStr) return null;
  
  const str = String(dateStr).trim();
  
  // 1. Check if it's an Excel serial date (pure numbers or floats)
  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    const ms = (serial - 25569) * 86400 * 1000;
    const utcDate = new Date(ms);
    return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
  }

  // 2. If it contains letters (e.g. "May", "Oct"), native JS Date is best
  if (/[a-zA-Z]/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Handle slashed/dashed dates: take only the date part before space
  const datePart = str.split(' ')[0];
  const parts = datePart.replace(/[\/-]/g, '/').split('/');
  
  if (parts.length === 3) {
    const nums = parts.map(n => parseInt(n, 10));
    if (!isNaN(nums[0]) && !isNaN(nums[1]) && !isNaN(nums[2])) {
      
      // Detect YYYY-MM-DD vs DD-MM-YYYY
      if (nums[0] > 31) {
        // YYYY-MM-DD
        let y = nums[0], m = nums[1], d = nums[2];
        if (y < 100) y += 2000;
        return new Date(y, m - 1, d);
      } else {
        // DD-MM-YYYY or MM-DD-YYYY
        let d = nums[0], m = nums[1], y = nums[2];
        if (y < 100) y += 2000;
        
        // If middle number is > 12, it must be MM/DD/YYYY, so swap them
        if (m > 12) {
          let temp = d;
          d = m;
          m = temp;
        }
        
        return new Date(y, m - 1, d);
      }
    }
  }

  // 4. Absolute fallback
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}
