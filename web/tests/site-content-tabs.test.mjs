import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = import.meta.dirname;
const read = (relative) => readFile(resolve(root, relative), "utf8");

const [
  announcementRoute,
  announcementIdRoute,
  announcementToggleRoute,
  logoRoute,
  publicLogoRoute,
  announcementService,
  assetService,
  assetPolicy,
  policy,
  homePage,
  loginPage,
  appShell,
  siteLogo,
  homeAnnouncements,
  adminPage,
  adminUi,
  content,
  seed,
  seedSql,
  schema,
  siteCss,
] = await Promise.all([
  read("../src/app/api/admin/announcements/route.ts"),
  read("../src/app/api/admin/announcements/[id]/route.ts"),
  read("../src/app/api/admin/announcements/[id]/toggle/route.ts"),
  read("../src/app/api/admin/content/logo/route.ts"),
  read("../src/app/api/site/assets/logo/route.ts"),
  read("../src/lib/admin-announcements.ts"),
  read("../src/lib/site-assets.ts"),
  read("../src/lib/site-asset-policy.ts"),
  read("../src/lib/announcement-policy.ts"),
  read("../src/app/page.tsx"),
  read("../src/app/login/page.tsx"),
  read("../src/components/app-shell.tsx"),
  read("../src/components/site-logo.tsx"),
  read("../src/components/home-announcements.tsx"),
  read("../src/app/admin/content/page.tsx"),
  read("../src/components/admin-content.tsx"),
  read("../src/lib/content.ts"),
  read("../scripts/seed-site-content.mjs"),
  read("../scripts/seed-site-content-part2.sql"),
  read("../../design/schema_cms_mariadb.sql"),
  read("../src/app/globals.css"),
]);

const adminApis = [
  ["announcements list/create", announcementRoute, 2],
  ["announcement update/delete", announcementIdRoute, 2],
  ["announcement toggle", announcementToggleRoute, 1],
  ["admin logo", logoRoute, 3],
];

test("every new admin API checks fresh server-side admin authorization", () => {
  for (const [name, source, expected] of adminApis) {
    const actual = (source.match(/authorizeAdminContent\(await getCurrentUser\(\)\)/g) ?? []).length;
    assert.equal(actual, expected, `${name}: expected ${expected} authorization checks, found ${actual}`);
  }
  assert.doesNotMatch(publicLogoRoute, /getCurrentUser|authorizeAdminContent/);
  assert.match(publicLogoRoute, /getSiteAssetFile\("logo"\)/);
});

test("mutations are audited, cached pages are refreshed, and SQL stays parameterized", () => {
  for (const action of [
    "content.announcement_create",
    "content.announcement_update",
    "content.announcement_toggle",
    "content.announcement_delete",
  ]) {
    assert.ok(announcementService.includes(action), `missing audit action ${action}`);
  }
  assert.match(announcementService, /INSERT INTO audit_logs \(user_id, action, entity, entity_id, detail, ip_address\)/);
  assert.match(announcementService, /JSON\.stringify\(detail\)/);
  assert.match(announcementService, /DELETE FROM announcements WHERE id = \?/);
  assert.match(announcementService, /LIMIT 20 OFFSET \?/);
  assert.match(announcementService, /LOCATE\(\?, title\) > 0 OR LOCATE\(\?, body\) > 0/);
  assert.match(announcementService, /pageSize: 20/);
  assert.match(announcementService, /getBangkokToday\(\)/);

  for (const [name, source] of adminApis) {
    if (name === "announcements list/create" || name === "announcement update/delete" || name === "announcement toggle" || name === "admin logo") {
      assert.match(source, /revalidatePath\("\/", "layout"\)/, `${name} must refresh cached pages`);
    }
  }
  assert.match(announcementRoute, /isBodyTooLarge\(request, 20_000\)/);
  assert.match(announcementIdRoute, /isBodyTooLarge\(request, 20_000\)/);
  assert.match(logoRoute, /consumeSiteUpload\(access\.actor\.id\)/);
});

test("logo uploads validate bytes, rename files, and remove old files only after commit", () => {
  assert.match(assetPolicy, /storageDirectory: "storage\/uploads\/site"/);
  assert.doesNotMatch(assetPolicy, /storageDirectory: "public/);
  assert.match(assetPolicy, /publicRoute: "\/api\/site\/assets\/logo"/);
  assert.match(assetPolicy, /acceptedTypes: \["image\/png", "image\/jpeg", "image\/webp"\]/);
  assert.match(assetPolicy, /maxBytes: MAX_SITE_ASSET_BYTES/);
  assert.match(assetPolicy, /maxWidth: MAX_SITE_ASSET_DIMENSION/);
  assert.match(assetPolicy, /maxHeight: MAX_SITE_ASSET_DIMENSION/);

  assert.match(assetService, /randomUUID\(\)/);
  assert.match(assetService, /await connection\.beginTransaction\(\)/);
  assert.match(assetService, /content\.logo_update/);
  assert.match(assetService, /content\.logo_reset/);
  assert.match(assetService, /await connection\.commit\(\);[\s\S]*removeFile\(previousAbsolute\)/);
  assert.match(assetService, /await connection\.rollback\(\);[\s\S]*removeFile\(newAbsolutePath\)/);
  assert.match(assetService, /WHERE asset_key = \? LIMIT 1 FOR UPDATE/);

  assert.match(publicLogoRoute, /"Content-Type": asset\.mimeType/);
  assert.match(publicLogoRoute, /"X-Content-Type-Options": "nosniff"/);
  assert.match(publicLogoRoute, /"Cache-Control": asset\.cacheControl/);
  assert.match(assetService, /max-age=31536000, immutable/);
});

test("header and login read the database logo while keeping the original display size", () => {
  assert.match(appShell, /<SiteLogo/);
  assert.match(loginPage, /<SiteLogo/);
  assert.match(siteLogo, /height=\{235\}/);
  assert.match(siteLogo, /width=\{600\}/);
  assert.doesNotMatch(appShell, /src="\/rsp-south-logo\.png"/);
  assert.doesNotMatch(loginPage, /src="\/rsp-south-logo\.png"/);
  assert.match(appShell, /fallbackAlt=\{content\["app\.logo\.alt"\]\}/);
  assert.match(loginPage, /fallbackAlt=\{content\["app\.logo\.alt"\]\}/);
  assert.doesNotMatch(siteLogo, /[\u0e00-\u0e7f]/);
});

test("homepage announcements use one bounded query and render plain text only", () => {
  assert.match(homePage, /getVisibleHomeAnnouncements\(\)/);
  assert.match(homePage, /<HomeAnnouncements/);
  assert.match(homeAnnouncements, /className="home-announcement-body"/);
  assert.doesNotMatch(homeAnnouncements, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(homeAnnouncements, /[\u0e00-\u0e7f]/);
  assert.match(siteCss, /\.home-announcement-body[\s\S]*white-space: pre-line/);
  assert.match(policy, /start_date <= \? AND \(end_date IS NULL OR end_date >= \?\)/);
  assert.match(policy, /ORDER BY created_at DESC, id DESC LIMIT 3/);
  assert.match(policy, /if \(today < item\.startDate\) return "upcoming";/);
  assert.match(policy, /if \(item\.endDate !== null && today > item\.endDate\) return "expired";/);
});

test("announcement UI shows Thai dates under date inputs and keeps four statuses", () => {
  assert.match(adminUi, /activeTab === "assets"/);
  assert.match(adminUi, /activeTab === "announcements"/);
  assert.match(adminUi, /activeTab === "options"/);
  assert.match(adminUi, /type="date"/);
  assert.match(adminUi, /formatThaiShortDate\(announcementForm\.startDate\)/);
  assert.match(adminUi, /formatThaiShortDate\(announcementForm\.endDate\)/);
  for (const status of ["active", "upcoming", "expired", "inactive"]) {
    assert.match(adminUi, new RegExp(`content\\.announcements\\.status\\.${status}`));
  }
  assert.match(adminPage, /listAnnouncements\(\{\}\)/);
  assert.match(adminPage, /getSiteAssetView\("logo", content\["app\.logo\.alt"\]\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS announcements/);
});

test("new content keys have fallbacks, seed rows, and a separate INSERT IGNORE SQL script", () => {
  const keys = [
    ...content.matchAll(/^\s*"((?:app\.logo|home\.announcements|content\.assets|content\.announcements)\.[^"]+)":/gm),
  ].map((match) => match[1]);
  assert.ok(keys.length >= 50, `expected new content fallbacks, found ${keys.length}`);
  for (const key of keys) {
    assert.ok(seed.includes(`"${key}"`), `missing mjs seed row for ${key}`);
    assert.ok(seedSql.includes(`('${key}',`), `missing SQL seed row for ${key}`);
  }
  assert.match(seedSql, /INSERT IGNORE INTO site_content \(content_key, page_group, label_th, content_value\)/);
  assert.doesNotMatch(seedSql, /^\s*(?:UPDATE|DELETE|DROP|ALTER)\b/im);
  assert.match(content, /"ระบบยังไม่รองรับไฟล์ SVG กรุณาใช้ PNG, JPG หรือ WebP"/);
  assert.match(seed, /"ระบบยังไม่รองรับไฟล์ SVG กรุณาใช้ PNG, JPG หรือ WebP"/);
});
