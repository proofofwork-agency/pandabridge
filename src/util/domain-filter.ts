export interface DomainCheckResult {
  blocked: boolean;
  reason?: string;
}

export function checkDomain(
  url: string,
  config: { domainAllowlist: string[]; domainBlocklist: string[] }
): DomainCheckResult {
  let hostname: string;
  let protocol: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    protocol = parsed.protocol;
  } catch {
    return { blocked: true, reason: `Invalid URL: ${url}` };
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    return { blocked: true, reason: `Blocked protocol: ${protocol}` };
  }

  if (!hostname) {
    return { blocked: true, reason: 'Blocked: empty hostname' };
  }

  const { domainAllowlist, domainBlocklist } = config;

  if (domainBlocklist.length > 0 && domainBlocklist.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return { blocked: true, reason: `Blocked: ${hostname} is on the domain blocklist` };
  }

  if (domainAllowlist.length > 0 && !domainAllowlist.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return { blocked: true, reason: `Blocked: ${hostname} is not on the domain allowlist` };
  }

  return { blocked: false };
}
