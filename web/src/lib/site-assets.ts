import "server-only";

import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { CONTENT_FALLBACKS } from "@/lib/content";
import { getDb } from "@/lib/db";
import {
  SITE_ASSET_REGISTRY,
  mimeTypeForExtension,
  parseStoredAssetPath,
  resolveAssetSource,
  storedAssetPath,
  validateLogoUpload,
  type LogoValidationError,
  type SiteAssetKey,
} from "@/lib/site-asset-policy";

interface AssetRow extends RowDataPacket {
  id: number;
  asset_key: string;
  label_th: string;
  file_path: string;
  alt_text: string | null;
  uploaded_by: string | null;
  created_at: Date | string;
}

export interface SiteAssetView {
  key: SiteAssetKey;
  src: string;
  alt: string;
  version: string;
  isFallback: boolean;
  updatedAt: string | null;
}

export type SaveSiteLogoResult =
  | { ok: true; view: SiteAssetView; warning: boolean }
  | { ok: false; error: LogoValidationError | "server" };

export type ResetSiteLogoResult = { ok: true; view: SiteAssetView; warning: boolean };

export interface SaveSiteLogoInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  altText: string;
  actorId: string;
  ipAddress: string | null;
}

function timestamp(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value.replace(" ", "T") + "+07:00");
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function fallbackAltText(key: SiteAssetKey): string {
  const fallbackKey = SITE_ASSET_REGISTRY[key].fallbackAltKey;
  return Object.hasOwn(CONTENT_FALLBACKS, fallbackKey)
    ? CONTENT_FALLBACKS[fallbackKey as keyof typeof CONTENT_FALLBACKS]
    : "";
}

function absoluteStoredPath(stored: string): string | null {
  const parsed = parseStoredAssetPath(stored);
  if (parsed) {
    const directory = path.join(process.cwd(), parsed.directory);
    const filePath = path.join(directory, parsed.fileName);
    return path.dirname(filePath) === directory ? filePath : null;
  }
  if (/^\/[A-Za-z0-9._-]+$/.test(stored)) {
    const publicDirectory = path.join(process.cwd(), "public");
    const filePath = path.join(publicDirectory, stored.slice(1));
    return path.dirname(filePath) === publicDirectory ? filePath : null;
  }
  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeFile(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeAssetAudit(
  connection: PoolConnection,
  actorId: string,
  action: "content.logo_update" | "content.logo_reset",
  ipAddress: string | null,
): Promise<void> {
  await connection.execute(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip_address)
     VALUES (?, ?, 'site_assets', ?, ?, ?)`,
    [actorId, action, "logo", JSON.stringify({ key: "logo" }), ipAddress],
  );
}

export async function getSiteAssetView(
  key: SiteAssetKey,
  fallbackText?: string,
): Promise<SiteAssetView> {
  const definition = SITE_ASSET_REGISTRY[key];
  const [rows] = await getDb().execute<AssetRow[]>(
    `SELECT id, asset_key, label_th, file_path, alt_text, uploaded_by, created_at
       FROM site_assets
      WHERE asset_key = ? LIMIT 1`,
    [key],
  );
  const row = rows[0] ?? null;
  const safeRow = row && parseStoredAssetPath(row.file_path) ? row : null;
  const absolute = absoluteStoredPath(safeRow?.file_path ?? definition.fallbackSrc);
  const exists = absolute ? await fileExists(absolute) : false;
  const resolved = resolveAssetSource(
    safeRow
      ? {
          file_path: safeRow.file_path,
          alt_text: safeRow.alt_text,
          created_at: safeRow.created_at,
        }
      : null,
    exists,
    {
      src: definition.fallbackSrc,
      alt: fallbackText ?? fallbackAltText(key),
    },
  );

  return {
    key,
    src: `${definition.publicRoute}?v=${encodeURIComponent(resolved.version)}`,
    alt: resolved.alt,
    version: resolved.version,
    isFallback: resolved.isFallback,
    updatedAt: safeRow ? timestamp(safeRow.created_at) : null,
  };
}

export interface SiteAssetFile {
  bytes: Uint8Array;
  mimeType: string;
  version: string;
  cacheControl: string;
}

export async function getSiteAssetFile(
  key: SiteAssetKey,
): Promise<SiteAssetFile | null> {
  const definition = SITE_ASSET_REGISTRY[key];
  const [rows] = await getDb().execute<AssetRow[]>(
    `SELECT id, asset_key, label_th, file_path, alt_text, uploaded_by, created_at
       FROM site_assets
      WHERE asset_key = ? LIMIT 1`,
    [key],
  );
  const row = rows[0] ?? null;
  const safeRow = row && parseStoredAssetPath(row.file_path) ? row : null;
  const absolute = absoluteStoredPath(safeRow?.file_path ?? definition.fallbackSrc);
  const exists = absolute ? await fileExists(absolute) : false;
  const resolved = resolveAssetSource(
    safeRow
      ? {
          file_path: safeRow.file_path,
          alt_text: safeRow.alt_text,
          created_at: safeRow.created_at,
        }
      : null,
    exists,
    { src: definition.fallbackSrc, alt: fallbackAltText(key) },
  );
  const resolvedAbsolute = absoluteStoredPath(resolved.path);
  if (!resolvedAbsolute || !(await fileExists(resolvedAbsolute))) return null;
  const bytes = await readFile(resolvedAbsolute);
  const extension = resolved.isFallback ? "png" : parseStoredAssetPath(resolved.path)?.extension;
  if (!extension) return null;

  return {
    bytes: new Uint8Array(bytes),
    mimeType: mimeTypeForExtension(extension),
    version: resolved.version,
    cacheControl: resolved.isFallback
      ? "public, max-age=3600"
      : "public, max-age=31536000, immutable",
  };
}

export async function saveSiteLogo(
  input: SaveSiteLogoInput,
): Promise<SaveSiteLogoResult> {
  const validation = validateLogoUpload({
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
    altText: input.altText,
  });
  if (!validation.ok) return validation;

  const definition = SITE_ASSET_REGISTRY.logo;
  const fileName = `${randomUUID()}.${validation.extension}`;
  const newStoredPath = storedAssetPath(definition.storageDirectory, fileName);
  const newAbsolutePath = absoluteStoredPath(newStoredPath);
  if (!newAbsolutePath) return { ok: false, error: "server" };

  await mkdir(path.dirname(newAbsolutePath), { recursive: true });
  await writeFile(newAbsolutePath, input.bytes, { flag: "wx" });

  let previousPath: string | null = null;
  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [previousRows] = await connection.execute<AssetRow[]>(
      "SELECT file_path FROM site_assets WHERE asset_key = ? LIMIT 1 FOR UPDATE",
      ["logo"],
    );
    previousPath = previousRows[0]?.file_path ?? null;
    await connection.execute(
      `INSERT INTO site_assets (asset_key, label_th, file_path, alt_text, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         file_path = VALUES(file_path),
         alt_text = VALUES(alt_text),
         uploaded_by = VALUES(uploaded_by),
         created_at = VALUES(created_at)`,
      [
        "logo",
        definition.labelTh,
        newStoredPath,
        validation.altText,
        input.actorId,
      ],
    );
    await writeAssetAudit(connection, input.actorId, "content.logo_update", input.ipAddress);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    await removeFile(newAbsolutePath);
    throw error;
  } finally {
    connection.release();
  }

  let warning = false;
  if (previousPath && previousPath !== newStoredPath) {
    const previousAbsolute = absoluteStoredPath(previousPath);
    if (previousAbsolute && previousAbsolute !== newAbsolutePath) {
      warning = !(await removeFile(previousAbsolute));
    }
  }

  return {
    ok: true,
    view: await getSiteAssetView("logo"),
    warning,
  };
}

export async function resetSiteLogo(
  actorId: string,
  ipAddress: string | null,
): Promise<ResetSiteLogoResult> {
  let previousPath: string | null = null;
  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [previousRows] = await connection.execute<AssetRow[]>(
      "SELECT file_path FROM site_assets WHERE asset_key = ? LIMIT 1 FOR UPDATE",
      ["logo"],
    );
    previousPath = previousRows[0]?.file_path ?? null;
    await connection.execute("DELETE FROM site_assets WHERE asset_key = ?", ["logo"]);
    await writeAssetAudit(connection, actorId, "content.logo_reset", ipAddress);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  let warning = false;
  if (previousPath) {
    const previousAbsolute = absoluteStoredPath(previousPath);
    if (previousAbsolute) warning = !(await removeFile(previousAbsolute));
  }

  return {
    ok: true,
    view: await getSiteAssetView("logo"),
    warning,
  };
}
