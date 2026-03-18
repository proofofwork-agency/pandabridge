export type DomainCheckResult =
  | { blocked: false }
  | { blocked: true; reason: string };

export function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function isPrivateOrReservedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Loopback
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '[::1]' || lower === '0.0.0.0') {
    return true;
  }

  // IPv6 addresses (bracketed)
  if (lower.startsWith('[') && lower.endsWith(']')) {
    const ip6 = lower.slice(1, -1);
    // Loopback ::1
    if (ip6 === '::1') return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x or ::ffff:hex:hex)
    if (ip6.startsWith('::ffff:')) {
      const mapped = ip6.slice(7);
      // Dotted form: ::ffff:127.0.0.1
      if (mapped.includes('.')) {
        return isPrivateIPv4(mapped);
      }
      // Hex form: ::ffff:7f00:1 — convert to IPv4
      const hexParts = mapped.split(':');
      if (hexParts.length === 2) {
        const high = parseInt(hexParts[0], 16);
        const low = parseInt(hexParts[1], 16);
        if (!isNaN(high) && !isNaN(low)) {
          const ip4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
          return isPrivateIPv4(ip4);
        }
      }
      return true; // Block all ::ffff: prefixed addresses by default
    }
    // Unique Local Address fc00::/7 (fc and fd prefixes)
    if (/^f[cd][0-9a-f]{2}:/.test(ip6)) return true;
    // Link-local fe80::/10
    if (/^fe[89ab][0-9a-f]:/.test(ip6)) return true;
    // Any-address ::
    if (ip6 === '::' || ip6 === '0::0' || ip6 === '0:0:0:0:0:0:0:0') return true;
    return false;
  }

  // Decimal IP (e.g., 2130706433 for 127.0.0.1)
  if (/^\d+$/.test(lower)) {
    const num = Number(lower);
    if (num >= 0 && num <= 0xFFFFFFFF) {
      const ip4 = `${(num >>> 24) & 0xff}.${(num >>> 16) & 0xff}.${(num >>> 8) & 0xff}.${num & 0xff}`;
      return isPrivateIPv4(ip4);
    }
  }

  // Hex IP (e.g., 0x7f000001 for 127.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(lower)) {
    const num = parseInt(lower, 16);
    if (num >= 0 && num <= 0xFFFFFFFF) {
      const ip4 = `${(num >>> 24) & 0xff}.${(num >>> 16) & 0xff}.${(num >>> 8) & 0xff}.${num & 0xff}`;
      return isPrivateIPv4(ip4);
    }
  }

  // Octal IP (e.g., 0177.0.0.1 for 127.0.0.1)
  if (/^0\d/.test(lower) && lower.includes('.')) {
    const octalParts = lower.split('.');
    if (octalParts.length === 4) {
      const parsed = octalParts.map(p => parseInt(p, p.startsWith('0') ? 8 : 10));
      if (parsed.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
        return isPrivateIPv4(parsed.join('.'));
      }
    }
  }

  // IPv4 private ranges
  return isPrivateIPv4(lower);
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // Link-local 169.254.0.0/16 (AWS metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // Shared address space 100.64.0.0/10
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // Loopback 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
  }
  return false;
}

/**
 * Check whether a URL is allowed by the domain filter.
 *
 * **Known limitation — DNS rebinding:** This filter operates on the URL hostname,
 * not on the resolved IP address. Services like `127.0.0.1.nip.io` resolve to
 * private IPs but pass the hostname check. Use `domainAllowlist` in sensitive
 * environments to mitigate this.
 */
export function checkDomain(
  url: string,
  config: { domainAllowlist: string[]; domainBlocklist: string[] }
): DomainCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { blocked: true, reason: `Invalid URL: ${url}` };
  }

  const hostname = parsed.hostname;
  const protocol = parsed.protocol;

  if (protocol !== 'http:' && protocol !== 'https:') {
    return { blocked: true, reason: `Blocked protocol: ${protocol}` };
  }

  if (!hostname) {
    return { blocked: true, reason: 'Blocked: empty hostname' };
  }

  if (isPrivateOrReservedHost(hostname)) {
    return { blocked: true, reason: `Blocked: ${hostname} is a private/reserved address` };
  }

  // Block URLs with embedded credentials
  if (parsed.username || parsed.password) {
    return { blocked: true, reason: 'Blocked: URL contains embedded credentials' };
  }

  const { domainAllowlist, domainBlocklist } = config;

  if (domainBlocklist.length > 0 && domainBlocklist.some(d => matchesDomain(hostname, d))) {
    return { blocked: true, reason: `Blocked: ${hostname} is on the domain blocklist` };
  }

  if (domainAllowlist.length > 0 && !domainAllowlist.some(d => matchesDomain(hostname, d))) {
    return { blocked: true, reason: `Blocked: ${hostname} is not on the domain allowlist` };
  }

  return { blocked: false };
}
