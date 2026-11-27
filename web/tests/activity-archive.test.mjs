import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  archiveSqlState,
  canTransitionArchiveState,
  getArchiveState,
  nextArchiveState,
} from "../src/lib/activity-archive-policy.ts";

const archiveSource = await readFile(new URL("../src/lib/activity-archive.ts", import.meta.url), "utf8");
const archiveListSource = await readFile(new URL("../src/app/api/activities/archive/route.ts", import.meta.url), "utf8");
const mineApiSource = await readFile(new URL("../src/app/api/activities/mine/route.ts", import.meta.url), "utf8");
const archiveActionSource = await readFile(new URL("../src/app/api/activities/archive/[kind]/[id]/route.ts", import.meta.url), "utf8");
const imageSource = await readFile(new URL("../src/app/api/activities/past/images/[imageId]/route.ts", import.meta.url), "utf8");
const contentSource = await readFile(new URL("../src/lib/content.ts", import.meta.url), "utf8");
const seedSource = await readFile(new URL("../scripts/seed-site-content.mjs", import.meta.url), "utf8");
const mineUiSource = await readFile(new URL("../src/components/mine-activities.tsx", import.meta.url), "utf8");
const globalsCssSource = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
const activeFilterSource = await readFile(new URL("../src/lib/mine-activity-filter.ts", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../src/lib/admin-dashboard-data.ts", import.meta.url), "utf8");
const exportSource = await readFile(new URL("../src/lib/admin-activities-query.ts", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const plannedSelectorSource = await readFile(new URL("../src/app/api/activities/past/planned/route.ts", import.meta.url), "utf8");

test("archive, restore, then purge is a one-way lifecycle", () => {
  let state = getArchiveState(null, null);
  assert.equal(state, "active");
  assert.equal(canTransitionArchiveState(state, "archive"), true);
  state = nextArchiveState("archive");
  assert.equal(state, "archived");
  assert.equal(canTransitionArchiveState(state, "restore"), true);
  state = nextArchiveState("restore");
  assert.equal(state, "active");
  state = nextArchiveState("archive");
  state = nextArchiveState("purge");
  assert.equal(state, "purged");
  assert.equal(canTransitionArchiveState(state, "restore"), false);
  assert.equal(canTransitionArchiveState(state, "archive"), false);
});

test("duplicate concurrent archive attempts conflict after the first state transition", () => {
  const lockedState = getArchiveState(null, null);
  assert.equal(canTransitionArchiveState(lockedState, "archive"), true);
  const stateAfterFirstCommit = nextArchiveState("archive");
  assert.equal(canTransitionArchiveState(stateAfterFirstCommit, "archive"), false);
});

test("transition SQL is conditional and never deletes activity rows", () => {
  assert.deepEqual(archiveSqlState("archive"), {
    setClause: "deleted_at = CURRENT_TIMESTAMP",
    whereClause: "deleted_at IS NULL AND purged_at IS NULL",
  });
  assert.deepEqual(archiveSqlState("restore"), {
    setClause: "deleted_at = NULL",
    whereClause: "deleted_at IS NOT NULL AND purged_at IS NULL",
  });
  assert.deepEqual(archiveSqlState("purge"), {
    setClause: "purged_at = CURRENT_TIMESTAMP",
    whereClause: "deleted_at IS NOT NULL AND purged_at IS NULL",
  });
  assert.doesNotMatch(archiveSource, /DELETE\s+FROM/i);
  assert.match(archiveSource, /FOR UPDATE/);
  assert.match(archiveSource, /beginTransaction/);
  assert.match(archiveSource, /commit\(\)/);
});

test("archive access is authenticated, department scoped, and mutations use POST", () => {
  assert.match(archiveActionSource, /getCurrentUser/);
  assert.match(archiveActionSource, /export async function POST/);
  assert.match(archiveSource, /main_department = \?/);
  assert.match(archiveListSource, /a\.purged_at IS NULL/);
  assert.match(archiveListSource, /a\.deleted_at IS NOT NULL/);
});

test("purged activities are excluded from active and image queries", () => {
  assert.match(mineApiSource, /buildMineActivityConditions/);
  assert.match(activeFilterSource, /a\.deleted_at IS NULL/);
  assert.match(dashboardSource, /deleted_at IS NULL/);
  assert.match(exportSource, /deleted_at IS NULL/);
  assert.match(homeSource, /deleted_at IS NULL/);
  assert.match(plannedSelectorSource, /deleted_at IS NULL/);
  assert.match(imageSource, /purged_at IS NULL/);
  assert.match(imageSource, /deleted_at IS NULL/);
});

test("every lifecycle operation records an audit entry in its transaction", () => {
  assert.match(archiveSource, /INSERT INTO audit_logs/);
  assert.match(archiveSource, /activity\.archive/);
  assert.match(archiveSource, /activity\.restore/);
  assert.match(archiveSource, /activity\.purge/);
  assert.match(archiveSource, /before,/);
  assert.match(archiveSource, /after,/);
  assert.doesNotMatch(archiveSource, /password|password_hash/i);
});

test("archive interface text has site_content fallbacks and seed entries", () => {
  const keys = [
    "archive.title", "archive.description", "archive.back", "archive.action.open",
    "archive.action.archive", "archive.action.store", "archive.action.restore", "archive.action.purge",
    "archive.column.date", "archive.confirm.title", "archive.confirm.archive",
    "archive.confirm.restore", "archive.confirm.purge", "archive.confirm.purge.warning",
    "archive.confirm.cancel", "archive.confirm.submit", "archive.confirm.submitting", "archive.success.archive",
    "archive.success.restore", "archive.success.purge", "err.archive.action",
  ];
  for (const key of keys) {
    const escaped = key.replaceAll(".", "\\.");
    assert.match(contentSource, new RegExp('"' + escaped + '"\\s*:'), key + " fallback");
    assert.match(seedSource, new RegExp('\\["' + escaped + '"'), key + " seed");
  }
});

test("mine page exposes a square icon-only archive link and a nonwrapping archive action", () => {
  assert.match(mineUiSource, /className="mine-archive-button"[^>]*title=\{content\["archive\.action\.open"\]\}/);
  assert.match(mineUiSource, /<History aria-hidden="true"/);
  assert.doesNotMatch(mineUiSource, /<span>\{content\["archive\.action\.open"\]\}<\/span>/);
  assert.match(mineUiSource, /<Archive aria-hidden="true"/);
  assert.match(mineUiSource, /className="mine-icon-action mine-archive-action whitespace-nowrap"/);
  assert.match(globalsCssSource, /\.mine-archive-button\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;/s);
  assert.match(globalsCssSource, /\.mine-table td:last-child\s*\{\s*min-width:\s*180px;/);
  assert.match(globalsCssSource, /@media \(max-width: 760px\)[\s\S]*?\.mine-table td:last-child\s*\{\s*min-width:\s*0;/);
});
