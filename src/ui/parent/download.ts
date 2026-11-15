/**
 * Hands a file to the parent. Where the browser can share files (an installed app on an iPhone or
 * iPad can, and a plain download there can leave the app stuck on a page of text) the share sheet
 * opens, so the file can go to Files or a message. Everywhere else it is an ordinary download.
 */
export async function deliver(file: { filename: string; text: string }): Promise<void> {
  const blob = new File([file.text], file.filename, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (installed && typeof nav.share === 'function' && nav.canShare?.({ files: [blob] })) {
    try {
      await nav.share({ files: [blob], title: file.filename });
      return;
    } catch (error) {
      // Closing the sheet is an answer. Anything else falls back to a download.
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: file.filename });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
