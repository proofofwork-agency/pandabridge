import type { Config } from '../config.js';
import { checkDomain } from './domain-filter.js';

export function getPostNavigationDomainError(
  requestedUrl: string,
  finalUrl: string,
  config: Config
): string | null {
  const domainCheck = checkDomain(finalUrl, config);
  if (!domainCheck.blocked) {
    return null;
  }

  return `Navigation to ${requestedUrl} redirected to a restricted domain (${finalUrl}). ${domainCheck.reason}`;
}
