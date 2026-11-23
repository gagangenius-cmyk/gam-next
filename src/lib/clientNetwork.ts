// Office-network check for the "office Wi-Fi only" setting. The office's public IP (or range) is what the
// server sees, so an allow-list entry is either an exact address or an IPv4 CIDR range such as 203.0.113.0/28.

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

export function normalizeIp(raw: string): string {
  let ip = String(raw || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4-mapped IPv6
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

export function ipMatchesEntry(ipRaw: string, entry: string): boolean {
  const ip = normalizeIp(ipRaw);
  const [base, bits] = entry.trim().split('/');
  if (!bits) return normalizeIp(base) === ip;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const prefix = Number(bits);
  if (ipInt === null || baseInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

export function isIpAllowed(ip: string, allowListText: string): boolean {
  const entries = String(allowListText || '').split(/[\s,;]+/).filter(Boolean);
  return entries.some((entry) => ipMatchesEntry(ip, entry));
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return normalizeIp(forwarded || headers.get('x-real-ip') || 'unknown');
}
