/** Readable trusted markup. Interpolated user text must still use escapeText(). */
export function html(parts, ...values) {
  return parts.reduce(
    (result, part, index) => result + part + (index < values.length ? String(values[index]) : ''),
    '',
  );
}
