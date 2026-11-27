import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  MAX_OPTION_ID,
  MAX_OPTION_TEXT_LENGTH,
  OPTION_DEFINITIONS,
  OPTION_GROUPS,
  compareOptionCode,
  computeGroupVersion,
  formatInactiveLabel,
  isOptionGroup,
  nextOptionId,
  normalizeDepartmentCode,
  validateBatchShape,
  validateCompleteOrder,
  validateDepartmentCode,
  validateOptionDraft,
  validateOptionKey,
} from "../src/lib/option-policy.ts";

const root = import.meta.dirname;
const read = (relative) => readFile(resolve(root, relative), "utf8");

const [
  listRoute,
  saveRoute,
  oldListRoute,
  oldItemRoute,
  oldToggleRoute,
  oldReorderRoute,
  service,
  policy,
  queries,
  ui,
  page,
  content,
  seed,
  seedSql,
  css,
  pastCreateRoute,
  plannedCreateRoute,
  pastEditRoute,
  plannedEditRoute,
  mineRoute,
] = await Promise.all([
  read("../src/app/api/admin/options/route.ts"),
  read("../src/app/api/admin/options/save/route.ts"),
  read("../src/app/api/admin/options/[group]/route.ts"),
  read("../src/app/api/admin/options/[group]/[id]/route.ts"),
  read("../src/app/api/admin/options/[group]/[id]/toggle/route.ts"),
  read("../src/app/api/admin/options/[group]/reorder/route.ts"),
  read("../src/lib/admin-options.ts"),
  read("../src/lib/option-policy.ts"),
  read("../src/lib/option-queries.ts"),
  read("../src/components/admin-content.tsx"),
  read("../src/app/admin/content/page.tsx"),
  read("../src/lib/content.ts"),
  read("../scripts/seed-site-content.mjs"),
  read("../scripts/seed-site-content-part3.sql"),
  read("../src/app/globals.css"),
  read("../src/app/api/activities/past/route.ts"),
  read("../src/app/api/activities/planned/route.ts"),
  read("../src/app/api/activities/past/[id]/route.ts"),
  read("../src/app/api/activities/planned/[id]/route.ts"),
  read("../src/app/api/activities/mine/route.ts"),
]);

const core = (key, overrides = {}) => ({
  key,
  nameTh: key,
  description: "",
  example: "",
  sortNo: 1,
  isActive: true,
  ...overrides,
});

const draft = (overrides = {}) => ({
  key: "SCI",
  code: "SCI",
  nameTh: "วิทยาศาสตร์",
  description: "",
  example: "",
  isActive: true,
  ...overrides,
});

const batch = (overrides = {}) => ({
  departments: { version: "v1", items: [draft()] },
  activity_types: {
    version: "v2",
    items: [{ ...draft({ key: "1", code: "", nameTh: "คณิตศาสตร์" }) }],
  },
  participant_types: {
    version: "v3",
    items: [{ ...draft({ key: "1", code: "", nameTh: "นักเรียน" }) }],
  },
  ...overrides,
});

test("master option registry follows the real schema", () => {
  assert.deepEqual([...OPTION_GROUPS], ["departments", "activity_types", "participant_types"]);
  assert.equal(OPTION_DEFINITIONS.departments.keyField, "code");
  assert.equal(OPTION_DEFINITIONS.departments.maxNameLength, 200);
  assert.equal(OPTION_DEFINITIONS.departments.supportsDescription, false);
  assert.equal(OPTION_DEFINITIONS.activity_types.keyField, "id");
  assert.equal(OPTION_DEFINITIONS.activity_types.supportsDescription, true);
  assert.equal(OPTION_DEFINITIONS.activity_types.supportsExample, true);
  assert.equal(OPTION_DEFINITIONS.participant_types.maxNameLength, 100);
  assert.equal(MAX_OPTION_ID, 32767);
  assert.equal(MAX_OPTION_TEXT_LENGTH, 1000);
  assert.equal(isOptionGroup("departments"), true);
  assert.equal(isOptionGroup("quarters"), false);
});

test("department codes are normalised, bounded and restricted to A-Z, digits and -", () => {
  assert.deepEqual(validateDepartmentCode(" sci-01 "), { ok: true, value: "SCI-01" });
  assert.equal(normalizeDepartmentCode("sci"), "SCI");
  assert.equal(validateDepartmentCode("").error, "required");
  assert.equal(validateDepartmentCode("S").error, "code_length");
  assert.equal(validateDepartmentCode("x".repeat(21)).error, "code_length");
  assert.equal(validateDepartmentCode("BAD CODE").error, "code");
  assert.equal(validateDepartmentCode("BAD_CODE").error, "code");
  assert.deepEqual(validateOptionKey("activity_types", "007"), { ok: true, value: "7" });
  assert.equal(validateOptionKey("activity_types", "0").ok, false);
  assert.equal(validateOptionKey("activity_types", String(MAX_OPTION_ID + 1)).ok, false);
  assert.equal(compareOptionCode("sci", " SCI "), true);
});

test("option text is trimmed, plain and bounded per group", () => {
  const valid = validateOptionDraft("departments", draft({ key: "", code: " sci ", nameTh: " วิทยาศาสตร์ " }));
  assert.deepEqual(valid, {
    ok: true,
    value: {
      key: "",
      code: "SCI",
      nameTh: "วิทยาศาสตร์",
      description: "",
      example: "",
      isActive: true,
    },
  });
  assert.equal(validateOptionDraft("departments", draft({ nameTh: "" })).error, "required");
  assert.equal(validateOptionDraft("departments", draft({ nameTh: "<b>ชื่อ</b>" })).error, "markup");
  assert.equal(validateOptionDraft("departments", draft({ nameTh: "ชื่อ\u0000" })).error, "control");
  assert.equal(validateOptionDraft("departments", draft({ nameTh: "ช".repeat(201) })).error, "name_length");
  assert.equal(validateOptionDraft("participant_types", draft({ key: "1", nameTh: "ช".repeat(101) })).error, "name_length");

  const activity = validateOptionDraft("activity_types", draft({
    key: "1",
    description: "อธิบาย\r\nบรรทัดต่อไป  ",
    example: "ตัวอย่าง",
  }));
  assert.ok(activity.ok);
  assert.equal(activity.value.description, "อธิบาย\nบรรทัดต่อไป");
  assert.equal(validateOptionDraft("activity_types", draft({ key: "1", example: "<script>alert(1)</script>" })).error, "markup");
  assert.equal(validateOptionDraft("activity_types", draft({ key: "1", description: "ก".repeat(1001) })).error, "text_length");

  const ignored = validateOptionDraft("participant_types", draft({ key: "1", description: "<b>x</b>" }));
  assert.ok(ignored.ok);
  assert.equal(ignored.value.description, "");
});

test("batch validation rejects duplicate names and duplicate codes regardless of case", () => {
  const duplicateName = batch({
    departments: {
      version: "v1",
      items: [draft(), draft({ key: "SCI2", code: "SCI2", nameTh: " วิทยาศาสตร์ " })],
    },
  });
  assert.equal(validateBatchShape(duplicateName).error, "duplicate");

  const duplicateCode = batch({
    departments: {
      version: "v1",
      items: [draft(), draft({ key: "", code: "sci", nameTh: "หน่วยอื่น" })],
    },
  });
  assert.equal(validateBatchShape(duplicateCode).error, "duplicate");

  const duplicateKey = batch({
    activity_types: {
      version: "v2",
      items: [draft({ key: "1", code: "", nameTh: "ก" }), draft({ key: "01", code: "", nameTh: "ข" })],
    },
  });
  assert.equal(validateBatchShape(duplicateKey).error, "duplicate");
  assert.equal(validateBatchShape({ ...batch(), participant_types: { version: "v3", items: [] } }).error, "invalid");
  assert.equal(validateBatchShape(null).error, "invalid");
});

test("the last active option cannot be disabled and the batch must be complete", () => {
  const current = [core("SCI")];
  assert.equal(
    validateCompleteOrder("departments", current, [draft({ isActive: false })]).error,
    "last_active",
  );
  assert.equal(
    validateCompleteOrder("departments", current, []).error,
    "incomplete",
  );
  assert.equal(
    validateCompleteOrder("departments", current, [draft({ key: "OTHER", code: "OTHER" })]).error,
    "unknown",
  );
  const reordered = [core("A"), core("B")];
  assert.ok(validateCompleteOrder("departments", reordered, [
    draft({ key: "B", code: "B", nameTh: "บ" }),
    draft({ key: "A", code: "A", nameTh: "ก" }),
  ]).ok);
});

test("new ids come from MAX(id)+1 and never collide inside one batch", () => {
  assert.deepEqual(nextOptionId([core("1"), core("3")], 2), { ok: true, value: 4 });
  assert.deepEqual(nextOptionId([], 1), { ok: true, value: 1 });
  assert.equal(nextOptionId([core(String(MAX_OPTION_ID))], 1).error, "overflow");
  assert.match(service, /GET_LOCK\(\?, 10\)/);
  assert.match(service, /nextOptionId\(current, newCount\)/);
  assert.match(service, /beginTransaction\(\)/);
  assert.match(service, /await connection\.commit\(\)/);
});

test("version token changes when order changes", () => {
  const first = computeGroupVersion("departments", [core("A"), core("B")]);
  const reordered = computeGroupVersion("departments", [
    core("B", { sortNo: 1 }),
    core("A", { sortNo: 2 }),
  ]);
  assert.notEqual(first, reordered);
  assert.equal(computeGroupVersion("departments", [core("A"), core("B")]), first);
  assert.match(saveRoute, /status: result\.error === "conflict" \? 409 : 400/);
  assert.match(content, /"content\.options\.error\.conflict": "ข้อมูลนี้ถูกแก้ไขโดยคนอื่นแล้ว กรุณาโหลดใหม่"/);
});

test("inactive suffix uses the current name", () => {
  assert.equal(formatInactiveLabel("วิทยาศาสตร์", " (ปิดใช้งาน)"), "วิทยาศาสตร์ (ปิดใช้งาน)");
  assert.equal(content.includes("แสดงชื่อเดิม"), false);
  assert.match(content, /"content\.options\.note": "[^"]*แสดงชื่อปัจจุบัน"/);
  assert.match(content, /"form\.option\.inactive": " \(ปิดใช้งาน\)"/);
});

test("option APIs re-check admin rights; legacy per-row routes are disabled", () => {
  for (const [name, source] of Object.entries({
    listRoute, saveRoute, oldListRoute, oldItemRoute, oldToggleRoute, oldReorderRoute,
  })) {
    assert.match(source, /authorizeAdminContent\(await getCurrentUser\(\)\)/, `${name} must check role and is_active`);
  }
  for (const [name, source] of Object.entries({
    oldListRoute, oldItemRoute, oldToggleRoute, oldReorderRoute,
  })) {
    assert.match(source, /status: 410/, `${name} must reject bypass attempts with 410`);
  }
  assert.match(saveRoute, /revalidatePath\("\/", "layout"\)/);
  assert.match(saveRoute, /revalidatePath\("\/admin\/content"\)/);
  assert.match(saveRoute, /requestIpAddress\(request\)/);
});

test("batch save is audited once per group with a safe summary and no row deletion", () => {
  assert.match(service, /'content\.options_update'/);
  assert.match(service, /VALUES \(\?, 'content\.options_update', \?, \?, \?\)/);
  assert.match(service, /JSON\.stringify\(\{ changes: group\.changes \}\)/);
  assert.equal(service.match(/INSERT INTO audit_logs/g).length, 1);
  assert.doesNotMatch(service, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(service, /\bDROP\s+TABLE\b/i);
  assert.match(service, /const sortNo = index \+ 1;/);
  assert.match(service, /sort_no = \?/);
  assert.match(service, /deleted_at IS NULL AND a\.purged_at IS NULL/);
  assert.doesNotMatch(service, /\$\{input\./);
});

test("create APIs reject inactive options but edit APIs keep previously chosen inactive values", () => {
  for (const [name, source] of Object.entries({ pastCreateRoute, plannedCreateRoute })) {
    assert.match(source, /WHERE code = \? AND is_active = 1/, `${name} must reject inactive departments`);
    assert.match(source, /WHERE id = \? AND is_active = 1/, `${name} must reject inactive types`);
  }
  for (const [name, source] of Object.entries({ pastEditRoute, plannedEditRoute })) {
    assert.match(source, /isOptionSelectable\("departments", mainDepartment, previousDepartments\)/, `${name} must allow the old department`);
    assert.match(source, /isOptionSelectable\("activity_types", String\(activityTypeId\)/, `${name} must allow the old activity type`);
    assert.match(source, /isOptionSelectable\("participant_types", String\(participantTypeId\)/, `${name} must allow the old participant type`);
    assert.match(source, /deleted_at IS NULL AND purged_at IS NULL/);
  }
  assert.match(queries, /if \(row\.is_active\) return true;\s*return previousKeys\.some/);
  assert.match(queries, /WHERE is_active = 1 OR \$\{column\} IN \(\$\{placeholders\}\)/);
  assert.match(queries, /mode: "create" \| "edit" \| "filter"/);
  assert.doesNotMatch(mineRoute, /FROM activity_types WHERE id = \? AND is_active = 1/);
  assert.doesNotMatch(mineRoute, /FROM departments WHERE code = \? AND is_active = 1/);
});

test("the options tab renders grouped cards, inline edits and a batch save bar", () => {
  const optionsSection = ui.slice(ui.indexOf('activeTab === "options"'));
  assert.ok(optionsSection.length > 0);
  assert.doesNotMatch(optionsSection.slice(0, 600), /content\.developing/);
  assert.match(ui, /snapshotToEditable\(initialOptions\)/);
  assert.match(ui, /OPTION_GROUPS\.map\(\(group\) =>/);
  assert.match(ui, /useState<Record<OptionGroup, boolean>>\(\{\s*departments: false, activity_types: false, participant_types: false/);
  assert.match(ui, /content\.options\.group\.count/);
  assert.match(ui, /content\["content\.options\.note"\]/);
  assert.match(ui, /content\.options\.drag/);
  assert.match(ui, /role="switch"/);
  assert.match(ui, /content\.options\.badge\.inactive/);
  assert.match(ui, /content\.options\.usage/);
  assert.match(ui, /content\.options\.details\.open/);
  assert.match(ui, /content\.options\.confirm\.title/);
  assert.match(ui, /content\.optionAddForm|setOptionAddForm/);
  assert.match(ui, /\/api\/admin\/options\/save/);
  assert.doesNotMatch(ui, /optionForm/);
  assert.doesNotMatch(ui, /toggleOption\(item\)|reorderOption\(item/);
  assert.match(page, /listOptionGroups\(\)/);
  assert.match(page, /options=\{options\}/);
  assert.match(css, /\.admin-content-option-row/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.admin-content-option-row \{\s*grid-template-columns/);
});

test("option content keys have fallbacks and seed rows", () => {
  const keys = [...content.matchAll(/^\s*"(content\.options\.[^"]+)":/gm)].map((match) => match[1]);
  assert.ok(keys.length >= 50, `expected option content fallbacks, found ${keys.length}`);
  for (const key of keys) {
    assert.ok(seed.includes(`"${key}"`), `missing mjs seed row for ${key}`);
    assert.ok(seedSql.includes(`('${key}',`), `missing SQL seed row for ${key}`);
  }
  assert.match(seedSql, /INSERT IGNORE INTO site_content \(content_key, page_group, label_th, content_value\)/);
  assert.doesNotMatch(seedSql, /^\s*(?:UPDATE|DELETE|DROP|ALTER)\b/im);
});
