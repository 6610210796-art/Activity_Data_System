import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVisibleAnnouncementsQuery,
  formatThaiShortDate,
  formatAnnouncementPeriod,
  getAnnouncementStatus,
  getBangkokToday,
  isAnnouncementVisible,
  isValidCalendarDate,
  validateAnnouncementInput,
} from "../src/lib/announcement-policy.ts";

const item = (overrides = {}) => ({
  title: "ประกาศทดสอบ",
  body: "รายละเอียดประกาศ",
  startDate: "2026-11-20",
  endDate: null,
  isActive: 1,
  ...overrides,
});

test("calendar dates are real dates in YYYY-MM-DD format", () => {
  assert.equal(isValidCalendarDate("2026-11-26"), true);
  assert.equal(isValidCalendarDate("2024-02-29"), true);
  assert.equal(isValidCalendarDate("2026-02-29"), false);
  assert.equal(isValidCalendarDate("2026-13-01"), false);
  assert.equal(isValidCalendarDate("26-11-2026"), false);
  assert.equal(isValidCalendarDate("2026-11-31"), false);
});

test("today uses Asia/Bangkok even when the server runs in another zone", () => {
  assert.equal(getBangkokToday(new Date("2026-11-26T17:30:00.000Z")), "2026-11-27");
  assert.equal(getBangkokToday(new Date("2026-11-26T16:30:00.000Z")), "2026-11-26");
});

test("announcement status is derived from string comparison, not runtime dates", () => {
  assert.equal(getAnnouncementStatus(item(), "2026-11-26"), "active");
  assert.equal(getAnnouncementStatus(item({ startDate: "2026-12-01" }), "2026-11-26"), "upcoming");
  assert.equal(getAnnouncementStatus(item({ endDate: "2026-11-25" }), "2026-11-26"), "expired");
  assert.equal(getAnnouncementStatus(item({ isActive: 0 }), "2026-11-26"), "inactive");
  assert.equal(isAnnouncementVisible(item({ endDate: "2026-11-26" }), "2026-11-26"), true);
  assert.equal(isAnnouncementVisible(item({ isActive: false }), "2026-11-26"), false);
});

test("homepage announcements use one bounded parameterized query", () => {
  const query = buildVisibleAnnouncementsQuery("2026-11-26");
  assert.equal((query.sql.match(/SELECT/g) ?? []).length, 1);
  assert.match(query.sql, /is_active = 1 AND start_date <= \? AND \(end_date IS NULL OR end_date >= \?\)/);
  assert.match(query.sql, /ORDER BY created_at DESC, id DESC LIMIT 3/);
  assert.deepEqual(query.values, ["2026-11-26", "2026-11-26"]);
});

test("plain text announcements accept newlines but reject markup and controls", () => {
  const valid = validateAnnouncementInput(item({ body: "บรรทัดแรก\nบรรทัดที่สอง" }));
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.value.endDate, null);

  assert.equal(validateAnnouncementInput(item({ title: "<b>ประกาศ</b>" })).error, "markup");
  assert.equal(validateAnnouncementInput(item({ body: "<script>alert(1)</script>" })).error, "markup");
  assert.equal(validateAnnouncementInput(item({ body: "ข้อความ\u0000ซ่อน" })).error, "control");
  assert.equal(validateAnnouncementInput(item({ title: " " })).error, "required");
  assert.equal(validateAnnouncementInput(item({ title: "ก".repeat(201) })).error, "title_length");
  assert.equal(validateAnnouncementInput(item({ body: "ก".repeat(1001) })).error, "body_length");
});

test("announcement dates are checked for validity and order on the server", () => {
  assert.equal(validateAnnouncementInput(item({ endDate: "2026-02-30" })).error, "date");
  assert.equal(validateAnnouncementInput(item({ endDate: "2026-11-19" })).error, "order");
  assert.equal(validateAnnouncementInput(item({ startDate: "2026-02-30" })).error, "required");
  const result = validateAnnouncementInput(item({ endDate: "2026-11-30", isActive: false }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.endDate, "2026-11-30");
    assert.equal(result.value.isActive, 0);
  }
});

test("announcement dates are shown in Thai calendar format without runtime parsing", () => {
  assert.equal(formatThaiShortDate("2026-11-26"), "26 พ.ย. 2569");
  assert.equal(formatThaiShortDate("invalid"), null);
  assert.equal(
    formatAnnouncementPeriod({ startDate: "2026-11-20", endDate: null, isActive: 1 }, "ไม่กำหนด"),
    "20 พ.ย. 2569 – ไม่กำหนด",
  );
});
