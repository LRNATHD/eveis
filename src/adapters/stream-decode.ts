export function concatByteChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0]!;
  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export function decodeUtf8Chunks(chunks: Uint8Array[]): string {
  if (chunks.length === 0) return "";
  return new TextDecoder("utf-8", { fatal: false }).decode(concatByteChunks(chunks));
}
