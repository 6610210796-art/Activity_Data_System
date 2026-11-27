import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssetVersion,
  detectImageType,
  mimeTypeForExtension,
  parseStoredAssetPath,
  readImageDimensions,
  resolveAssetSource,
  validateLogoUpload,
} from "../src/lib/site-asset-policy.ts";

function pngBytes(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

function webpBytes(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x16, 0x00, 0x00, 0x00], 4);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >>> 8) & 0xff;
  bytes[26] = (w >>> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >>> 8) & 0xff;
  bytes[29] = (h >>> 16) & 0xff;
  return bytes;
}

const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

test("image type and dimensions come from file bytes, not the supplied name", () => {
  assert.equal(detectImageType(pngBytes(600, 235)), "png");
  assert.equal(detectImageType(webpBytes(640, 360)), "webp");
  assert.equal(detectImageType(new Uint8Array([0x00, 0x01, 0x02])), null);
  assert.deepEqual(readImageDimensions(pngBytes(600, 235), "png"), { width: 600, height: 235 });
  assert.deepEqual(readImageDimensions(webpBytes(640, 360), "webp"), { width: 640, height: 360 });
});

test("valid PNG, JPG and WebP logos pass while SVG is rejected explicitly", () => {
  const png = validateLogoUpload({
    fileName: "logo.png", mimeType: "image/png", bytes: pngBytes(600, 235), altText: " โลโก้ ",
  });
  assert.deepEqual(png, { ok: true, extension: "png", altText: "โลโก้" });

  assert.deepEqual(validateLogoUpload({
    fileName: "logo.svg", mimeType: "image/svg+xml", bytes: svgBytes, altText: "",
  }), { ok: false, error: "svg" });
  assert.deepEqual(validateLogoUpload({
    fileName: "logo.png", mimeType: "image/png", bytes: svgBytes, altText: "",
  }), { ok: false, error: "svg" });
  assert.deepEqual(validateLogoUpload({
    fileName: " logo.svg.png ", mimeType: "image/png", bytes: pngBytes(10, 10), altText: "",
  }), { ok: true, extension: "png", altText: null });
});

test("logo size, dimensions, type and alt text are enforced", () => {
  assert.equal(validateLogoUpload({
    fileName: "logo.png", mimeType: "image/png", bytes: pngBytes(4001, 10), altText: "",
  }).error, "dimension");
  assert.equal(validateLogoUpload({
    fileName: "logo.png", mimeType: "image/png", bytes: pngBytes(10, 4001), altText: "",
  }).error, "dimension");
  assert.equal(validateLogoUpload({
    fileName: "logo.png", mimeType: "image/png",
    bytes: new Uint8Array(2 * 1024 * 1024 + 1), altText: "",
  }).error, "size");
  assert.equal(validateLogoUpload({
    fileName: "logo.gif", mimeType: "image/gif", bytes: new Uint8Array([0x47, 0x49, 0x46]), altText: "",
  }).error, "type");
  assert.equal(validateLogoUpload({
    fileName: "logo.png", mimeType: "image/png", bytes: pngBytes(10, 10), altText: "ก".repeat(256),
  }).error, "alt_length");
});

test("stored paths allow only generated UUID filenames inside the site directory", () => {
  const valid = "storage/uploads/site/123e4567-e89b-12d3-a456-426614174000.webp";
  assert.deepEqual(parseStoredAssetPath(valid), {
    directory: "storage/uploads/site",
    fileName: "123e4567-e89b-12d3-a456-426614174000.webp",
    extension: "webp",
  });
  assert.equal(parseStoredAssetPath("storage/uploads/site/../../secret.png"), null);
  assert.equal(parseStoredAssetPath("/rsp-south-logo.png"), null);
  assert.equal(mimeTypeForExtension("jpg"), "image/jpeg");
  assert.equal(mimeTypeForExtension("webp"), "image/webp");
});

test("missing or unsafe stored files fall back with a stable version", () => {
  const fallback = { src: "/rsp-south-logo.png", alt: "โลโก้เริ่มต้น" };
  const createdAt = new Date("2026-11-26T00:00:00.000Z");
  const row = {
    file_path: "storage/uploads/site/123e4567-e89b-12d3-a456-426614174000.png",
    alt_text: "โลโก้จากฐานข้อมูล",
    created_at: createdAt,
  };

  const missing = resolveAssetSource(row, false, fallback);
  assert.equal(missing.path, fallback.src);
  assert.equal(missing.alt, fallback.alt);
  assert.equal(missing.isFallback, true);
  assert.equal(missing.version, buildAssetVersion(null, fallback.src));

  const present = resolveAssetSource(row, true, fallback);
  assert.equal(present.path, row.file_path);
  assert.equal(present.alt, row.alt_text);
  assert.equal(present.isFallback, false);
  assert.notEqual(present.version, missing.version);

  const unsafe = resolveAssetSource({ ...row, file_path: "../../secret.png" }, true, fallback);
  assert.equal(unsafe.isFallback, true);

  const newer = buildAssetVersion({ ...row, file_path: "storage/uploads/site/123e4567-e89b-12d3-a456-426614174001.png", created_at: createdAt }, fallback.src);
  assert.notEqual(newer, present.version);
});
