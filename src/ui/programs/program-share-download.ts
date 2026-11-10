/** DIDI-1015: open the public link page and trigger the same print path as PublicLinkPage. */
export function openShareLinkPageForPrint(shareUrl: string): void {
  const trimmed = shareUrl.trim();
  if (trimmed.length === 0) {
    return;
  }
  const opened = window.open(trimmed, "_blank", "noopener,noreferrer");
  if (!opened) {
    return;
  }
  const runPrint = () => {
    opened.print();
  };
  opened.addEventListener("load", runPrint);
  try {
    if (opened.document?.readyState === "complete") {
      runPrint();
    }
  } catch {
    /* cross-origin until load */
  }
}
