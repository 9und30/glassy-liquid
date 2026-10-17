/**
 * Minimal synchronous PNG encoder (RGBA8, stored deflate blocks).
 * Used where no canvas is available and as an exact, color-management-free
 * path for displacement maps.
 */
let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

export function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const zlibLen = 2 + raw.length + blocks * 5 + 4;
  const zlib = new Uint8Array(zlibLen);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let o = 2;
  for (let i = 0; i < blocks; i++) {
    const start = i * 65535;
    const len = Math.min(65535, raw.length - start);
    zlib[o++] = i === blocks - 1 ? 1 : 0;
    zlib[o++] = len & 0xff;
    zlib[o++] = (len >>> 8) & 0xff;
    zlib[o++] = ~len & 0xff;
    zlib[o++] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(start, start + len), o);
    o += len;
  }
  const ad = adler32(raw);
  zlib[o++] = (ad >>> 24) & 0xff;
  zlib[o++] = (ad >>> 16) & 0xff;
  zlib[o++] = (ad >>> 8) & 0xff;
  zlib[o] = ad & 0xff;

  const chunks: Array<[string, Uint8Array]> = [];
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunks.push(["IHDR", ihdr], ["IDAT", zlib], ["IEND", new Uint8Array(0)]);

  let total = 8;
  for (const [, data] of chunks) total += 12 + data.length;
  const png = new Uint8Array(total);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  let p = 8;
  const view = new DataView(png.buffer);
  for (const [type, data] of chunks) {
    view.setUint32(p, data.length);
    for (let i = 0; i < 4; i++) png[p + 4 + i] = type.charCodeAt(i);
    png.set(data, p + 8);
    view.setUint32(p + 8 + data.length, crc32(png, p + 4, p + 8 + data.length));
    p += 12 + data.length;
  }
  return png;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

let scratch: HTMLCanvasElement | null | undefined;

/**
 * Encode RGBA pixels as a PNG data URL. Uses the browser's (compressing)
 * canvas encoder when available, the exact stored encoder otherwise. Canvas
 * premultiplies translucent pixels, which costs a little color precision at
 * very low alpha - irrelevant for highlights, so only callers that need
 * bit-exact translucent data pass `allowCanvas = false`.
 */
export function pngDataUrl(
  width: number,
  height: number,
  rgba: Uint8ClampedArray<ArrayBuffer>,
  allowCanvas = true,
): string {
  if (allowCanvas && typeof document !== "undefined") {
    if (scratch === undefined) {
      try {
        scratch = document.createElement("canvas");
        if (!scratch.getContext("2d")) scratch = null;
      } catch {
        scratch = null;
      }
    }
    if (scratch) {
      scratch.width = width;
      scratch.height = height;
      const ctx = scratch.getContext("2d");
      if (ctx) {
        ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
        const url = scratch.toDataURL("image/png");
        if (url.startsWith("data:image/png")) return url;
      }
    }
  }
  return `data:image/png;base64,${base64(encodePng(width, height, rgba))}`;
}
