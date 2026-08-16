function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (error && typeof error === 'object') {
    const candidate = error as { stack?: unknown; message?: unknown };
    if (candidate.stack) return String(candidate.stack);
    if (candidate.message) return String(candidate.message);
  }
  return String(error);
}

/** Safely renders a fatal error without interpreting the error text as HTML. */
export function renderFatalError(
  container: HTMLElement,
  label: string,
  error: unknown,
  replaceExisting = false,
): boolean {
  if (!replaceExisting && container.hasChildNodes()) return false;

  const panel = container.ownerDocument.createElement('div');
  panel.style.cssText = 'padding:24px;font-family:monospace;white-space:pre-wrap;color:#900;background:#fee';
  panel.textContent = `${label}: ${errorText(error)}`;
  container.replaceChildren(panel);
  return true;
}
