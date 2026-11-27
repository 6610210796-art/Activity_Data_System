import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  authorizeAdminContent,
  hasSameTimestamp,
  parseContentHistoryFilters,
  validateContentValue,
} from "../src/lib/admin-content-policy.ts";
import { getContentMetadata } from "../src/lib/content-catalog.ts";
import { resolveAuthenticatedProfile } from "../src/lib/auth-profile.ts";

const root = import.meta.dirname;
const route = await readFile(resolve(root, "../src/app/api/admin/content/route.ts"), "utf8");
const restoreRoute = await readFile(resolve(root, "../src/app/api/admin/content/history/[id]/restore/route.ts"), "utf8");
const service = await readFile(resolve(root, "../src/lib/admin-content.ts"), "utf8");
const page = await readFile(resolve(root, "../src/app/admin/content/page.tsx"), "utf8");
const ui = await readFile(resolve(root, "../src/components/admin-content.tsx"), "utf8");
const content = await readFile(resolve(root, "../src/lib/content.ts"), "utf8");
const seed = await readFile(resolve(root, "../scripts/seed-site-content.mjs"), "utf8");
const schema = await readFile(resolve(root, "../../design/schema_cms_mariadb.sql"), "utf8");
const auth = await readFile(resolve(root, "../src/lib/auth.ts"), "utf8");

test("only admins can enter page and each content API checks fresh authentication", () => {
  assert.deepEqual(authorizeAdminContent(null), { allowed: false, status: 401, error: "session" });
  assert.deepEqual(authorizeAdminContent({ id: "unit-1", role: "unit_user" }), { allowed: false, status: 403, error: "forbidden" });
  assert.equal(authorizeAdminContent({ id: "admin-1", role: "admin" }).allowed, true);
  assert.equal((route.match(/authorizeAdminContent\(await getCurrentUser\(\)\)/g) ?? []).length, 2);
  assert.match(restoreRoute, /authorizeAdminContent\(await getCurrentUser\(\)\)/);
  assert.match(page, /const actor = await requireUser\(\)/);
  assert.match(page, /if \(actor\.role !== "admin"\) redirect\("\/"\)/);
});

test("the current database profile invalidates a disabled user's old JWT", () => {
  assert.equal(resolveAuthenticatedProfile({ id: "u", email: "u@example.test", full_name: "U", role: "admin", department_code: null, is_active: 0 }), null);
  assert.match(auth, /SELECT id, email, full_name, role, department_code, is_active FROM profiles/);
  assert.match(auth, /resolveAuthenticatedProfile\(rows\[0\]\)/);
});

test("content values reject markup, oversized strings, controls, and removed placeholders", () => {
  assert.equal(validateContentValue("<script>alert(1)</script>", "plain").error, "markup");
  assert.equal(validateContentValue("x".repeat(1001), "short fallback").error, "length");
  assert.equal(validateContentValue("  \u0000hidden", "plain").error, "control");
  assert.equal(validateContentValue("สรุปทั้งหมด", "สรุป {count} รายการ").error, "placeholder");
  assert.equal(validateContentValue("สรุป {count} รายการ", "สรุป {count} รายการ").error, null);
  assert.equal(validateContentValue("  ข้อความใหม่  ", "ค่าเดิม").value, "ข้อความใหม่");
});

test("stale edits are rejected and the update transaction locks rows before writes", () => {
  assert.equal(hasSameTimestamp("2026-11-26T03:00:00.000Z", new Date("2026-11-26T03:00:00.000Z")), true);
  assert.equal(hasSameTimestamp("2026-11-26T03:00:00.000Z", new Date("2026-11-26T03:00:01.000Z")), false);
  assert.match(service, /SELECT id, content_value, updated_at FROM site_content WHERE content_key = \? LIMIT 1 FOR UPDATE/);
  assert.match(service, /row\.content_value !== change\.originalValue/);
  assert.match(service, /UPDATE site_content SET content_value = \?, updated_by = \? WHERE id = \?/);
  assert.match(service, /await connection\.rollback\(\)/);
});

test("fallback-only content keys are inserted with catalog metadata on first save", () => {
  assert.deepEqual(getContentMetadata("err.required", "กรุณากรอกข้อมูล"), { pageGroup: "error", labelTh: "กรุณากรอกข้อมูล" });
  assert.match(service, /INSERT IGNORE INTO site_content \(content_key, page_group, label_th, content_value\) VALUES \(\?, \?, \?, \?\)/);
  assert.match(service, /\[change\.key, metadata\.pageGroup, metadata\.labelTh, change\.fallback\]/);
  assert.match(service, /insertResult\.affectedRows !== 1/);
});

test("history restore creates a normal new content update and never edits old history rows", () => {
  assert.match(service, /SELECT h\.id, h\.content_id, h\.old_value, sc\.content_key, sc\.content_value/);
  assert.match(service, /UPDATE site_content SET content_value = \?, updated_by = \? WHERE id = \?/);
  assert.match(service, /writeContentAudit\(connection, actorId, \[key\]/);
  assert.doesNotMatch(service, /(?:UPDATE|DELETE\s+FROM)\s+content_history/i);
  assert.match(schema, /CREATE TRIGGER trg_site_content_au AFTER UPDATE ON site_content/);
});

test("one content audit row records changed keys only, while the database trigger stores value history", () => {
  assert.match(service, /VALUES \(\?, 'content\.update', 'site_content', \?, \?\)/);
  assert.match(service, /JSON\.stringify\(\{ keys \}\)/);
  assert.match(service, /await writeContentAudit\(connection, actorId, changedKeys, ipAddress\)/);
  assert.match(service, /INSERT IGNORE INTO site_content/);
  assert.match(schema, /INSERT INTO content_history \(content_id, old_value, new_value, changed_by\)/);
});

test("content route refreshes cached pages after changes and the admin UI has the requested tabs and history filters", () => {
  assert.match(route, /revalidatePath\("\/", "layout"\)/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(ui, /role="tablist"/);
  assert.match(ui, /content\.tab\.history/);
  assert.match(ui, /window\.setTimeout\(\(\) => \{/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /target="_blank" rel="noopener noreferrer"/);
});

test("all new content UI strings have code fallbacks and seed rows", () => {
  const keys = [...content.matchAll(/^\s*"(content\.[^"]+)":/gm)].map((match) => match[1]);
  assert.ok(keys.length >= 60, `expected comprehensive content UI fallbacks, found ${keys.length}`);
  for (const key of keys) {
    assert.ok(seed.includes(`"${key}"`), `missing seed row for ${key}`);
  }
  assert.match(content, /"nav\.content": "จัดการเนื้อหา"/);
  assert.match(seed, /\["nav\.content", "navigation"/);
});

test("history filters are bounded and URL data is parsed safely", () => {
  assert.deepEqual(parseContentHistoryFilters({ q: "x".repeat(180), page: "0", from: "2026-11-01", group: "g".repeat(100) }), {
    from: "2026-11-01", to: "", editor: "", group: "g".repeat(50), q: "x".repeat(150), page: 1,
  });
});
