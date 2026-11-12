export function decodeUtf8Chunks(chunks: Uint8Array[]): string {
  if (chunks.length === 0) return "";
  if (chunks.length === 1) {
    return new TextDecoder("utf-8", { fatal: false }).decode(chunks[0]);
  }
  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}
