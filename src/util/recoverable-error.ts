export function isRecoverableNavigationError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('target page, context or browser has been closed') ||
    message.includes('browser has been closed') ||
    message.includes('connection closed') ||
    message.includes('target closed') ||
    message.includes('econnrefused')
  );
}
