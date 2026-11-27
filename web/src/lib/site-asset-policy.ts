export type SiteAssetKey = "logo";
export type SiteAssetExtension = "png" | "jpg" | "webp";

export interface SiteAssetDefinition {
  key: SiteAssetKey;
  labelTh: string;
  acceptedTypes: readonly string[];
  maxBytes: number;
  maxWidth: number;
  maxHeight: number;
  fallbackSrc: string;
  fallbackAltKey: string;
  storageDirectory: string;
  publicRoute: string;
}

export const MAX_SITE_ASSET_BYTES = 2 * 1024 * 1024;
export const MAX_SITE_ASSET_DIMENSION = 4000;

export const SITE_ASSET_REGISTRY: Record<SiteAssetKey, SiteAssetDefinition> = {
  logo: {
    key: "logo",
    labelTh: "โลโก้ระบบ",
    acceptedTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: MAX_SITE_ASSET_BYTES,
    maxWidth: MAX_SITE_ASSET_DIMENSION,
    maxHeight: MAX_SITE_ASSET_DIMENSION,
    fallbackSrc: "/rsp-south-logo.png",
    fallbackAltKey: "app.logo.alt",
    storageDirectory: "storage/uploads/site",
    publicRoute: "/api/site/assets/logo",
  },
};

export function isSiteAssetKey(value: string): value is SiteAssetKey {
  return Object.hasOwn(SITE_ASSET_REGISTRY, value);
}

export type LogoValidationError =
  | "svg"
  | "type"
  | "size"
  | "dimension"
  | "invalid"
  | "alt_length";

export interface LogoValidationInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  altText: string;
}

export type LogoValidationResult =
  | { ok: true; extension: SiteAssetExtension; altText: string | null }
  | { ok: false; error: LogoValidationError };

export interface SiteAssetRowLike {
  file_path: string;
  alt_text: string | null;
  created_at: Date | string;
}

export interface ResolvedSiteAsset {
  path: string;
  alt: string;
  isFallback: boolean;
  version: string;
}

export interface StoredAssetPath {
  directory: string;
  fileName: string;
  extension: SiteAssetExtension;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let output = "";
  for (let index = start; index < Math.min(start + length, bytes.length); index += 1) {
    output += String.fromCharCode(bytes[index]);
  }
  return output;
}

function looksLikeSvg(input: LogoValidationInput): boolean {
  if (input.mimeType.trim().toLowerCase() === "image/svg+xml") return true;
  if (/\.svg$/i.test(input.fileName.trim())) return true;
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(input.bytes.slice(0, 512))
    .toLowerCase();
  return /<svg[\s>]/i.test(head) || /<\?xml[^>]*>\s*<svg/i.test(head);
}

export function detectImageType(bytes: Uint8Array): SiteAssetExtension | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>> 0
  );
}

export function readImageDimensions(
  bytes: Uint8Array,
  extension: SiteAssetExtension,
): { width: number; height: number } | null {
  if (extension === "png") {
    if (bytes.length < 24) return null;
    const width = (bytes[16] * 0x1000000) + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
    const height = (bytes[20] * 0x1000000) + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23];
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (extension === "jpg") {
    let offset = 2;
    while (offset + 1 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      if (offset + 1 >= bytes.length) return null;
      const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
      if (segmentLength < 2) return null;
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isStartOfFrame) {
        if (offset + 7 > bytes.length) return null;
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      offset += segmentLength;
    }
    return null;
  }

  if (bytes.length < 30) return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = readUInt16LE(bytes, 26) & 0x3fff;
    const height = readUInt16LE(bytes, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = readUInt32LE(bytes, 21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

export function validateLogoUpload(input: LogoValidationInput): LogoValidationResult {
  const definition = SITE_ASSET_REGISTRY.logo;
  const altText = input.altText.trim();
  if ([...altText].length > 255) return { ok: false, error: "alt_length" };
  if (looksLikeSvg(input)) return { ok: false, error: "svg" };
  if (input.bytes.length > definition.maxBytes) return { ok: false, error: "size" };
  const extension = detectImageType(input.bytes);
  if (!extension) return { ok: false, error: "type" };
  const dimensions = readImageDimensions(input.bytes, extension);
  if (!dimensions) return { ok: false, error: "invalid" };
  if (
    dimensions.width > definition.maxWidth ||
    dimensions.height > definition.maxHeight
  ) {
    return { ok: false, error: "dimension" };
  }
  return { ok: true, extension, altText: altText || null };
}

export function hashVersion(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildAssetVersion(
  row: Pick<SiteAssetRowLike, "file_path" | "created_at"> | null,
  fallbackSrc: string,
): string {
  if (!row) return `v-fallback-${hashVersion(fallbackSrc)}`;
  const createdAt =
    typeof row.created_at === "string"
      ? row.created_at
      : row.created_at.toISOString();
  return `v-${hashVersion(`${row.file_path}|${createdAt}`)}`;
}

export function parseStoredAssetPath(value: string): StoredAssetPath | null {
  const match =
    /^storage\/uploads\/site\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg|webp)$/.exec(
      value,
    );
  if (!match) return null;
  return {
    directory: "storage/uploads/site",
    fileName: `${match[1]}.${match[2]}`,
    extension: match[2] as SiteAssetExtension,
  };
}

export function resolveAssetSource(
  row: SiteAssetRowLike | null,
  fileExists: boolean,
  fallback: { src: string; alt: string },
): ResolvedSiteAsset {
  const safeRow = row && parseStoredAssetPath(row.file_path) ? row : null;
  const useFallback = !safeRow || !fileExists;
  return {
    path: useFallback ? fallback.src : safeRow.file_path,
    alt: safeRow && !useFallback && safeRow.alt_text !== null
      ? safeRow.alt_text
      : fallback.alt,
    isFallback: useFallback,
    version: buildAssetVersion(useFallback ? null : safeRow, fallback.src),
  };
}

export function mimeTypeForExtension(extension: SiteAssetExtension): string {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

export function storedAssetPath(directory: string, fileName: string): string {
  return `${directory}/${fileName}`;
}
