export function excelSafeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r\n]/.test(text)) {
    text = `'${text}`;
  }
  return text;
}
