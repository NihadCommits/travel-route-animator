// UTF-8 without TextDecoder: core runs without browser or Node APIs (tsconfig: no "dom", no
// "node"), and track files are the one place it gets raw bytes of text.

/** Text from UTF-8 bytes; broken sequences become U+FFFD, a leading byte order mark is dropped. */
export function decodeUtf8(bytes: Uint8Array): string {
  const codes: number[] = [];
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (i < bytes.length) {
    const first = bytes[i]!;
    const length = first < 0x80 ? 1 : first >= 0xf0 ? 4 : first >= 0xe0 ? 3 : first >= 0xc0 ? 2 : 0;
    if (length === 0 || i + length > bytes.length) {
      codes.push(0xfffd);
      i++;
      continue;
    }
    let code = length === 1 ? first : first & (0xff >> (length + 1));
    let valid = true;
    for (let k = 1; k < length; k++) {
      const next = bytes[i + k]!;
      if ((next & 0xc0) !== 0x80) valid = false;
      code = (code << 6) | (next & 0x3f);
    }
    codes.push(valid ? code : 0xfffd);
    i += valid ? length : 1;
  }
  // In chunks: String.fromCodePoint takes its arguments on the stack.
  let text = '';
  for (let k = 0; k < codes.length; k += 8192) {
    text += String.fromCodePoint(...codes.slice(k, k + 8192));
  }
  return text;
}
