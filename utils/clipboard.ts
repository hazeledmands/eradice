import { withAsyncSpan } from '../lib/tracing';

/**
 * Copies text to clipboard with fallback for older browsers
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 */
export async function copyToClipboard(text: string): Promise<void> {
  return withAsyncSpan('clipboard.copy', { 'clipboard.text_length': text.length }, async (span) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      span.setAttribute('clipboard.method', 'navigator');
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        console.error('Failed to copy text:', err);
        throw err;
      }
    } else {
      span.setAttribute('clipboard.method', 'fallback');
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed:', err);
        throw err;
      }
      document.body.removeChild(textArea);
    }
  });
}

