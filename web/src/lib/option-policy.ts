export type OptionGroup = "departments" | "activity_types" | "participant_types";

export interface OptionDefinition {
  group: OptionGroup;
  table: OptionGroup;
  keyField: "code" | "id";
  groupLabelKey: string;
  maxNameLength: number;
  supportsDescription: boolean;
  supportsExample: boolean;
}

export const OPTION_GROUPS: readonly OptionGroup[] = [
  "departments",
  "activity_types",
  "participant_types",
];

export const OPTION_DEFINITIONS: Record<OptionGroup, OptionDefinition> = {
  departments: {
    group: "departments",
    table: "departments",
    keyField: "code",
    groupLabelKey: "content.options.group.departments",
    maxNameLength: 200,
    supportsDescription: false,
    supportsExample: false,
  },
  activity_types: {
    group: "activity_types",
    table: "activity_types",
    keyField: "id",
    groupLabelKey: "content.options.group.activity_types",
    maxNameLength: 200,
    supportsDescription: true,
    supportsExample: true,
  },
  participant_types: {
    group: "participant_types",
    table: "participant_types",
    keyField: "id",
    groupLabelKey: "content.options.group.participant_types",
    maxNameLength: 100,
    supportsDescription: false,
    supportsExample: false,
  },
};

export const MAX_OPTION_TEXT_LENGTH = 1000;
export const MAX_OPTION_ID = 32767;
export const MIN_DEPARTMENT_CODE_LENGTH = 2;
export const MAX_DEPARTMENT_CODE_LENGTH = 20;
export const MAX_OPTIONS_PER_GROUP = 200;

export function isOptionGroup(value: unknown): value is OptionGroup {
  return typeof value === "string" && OPTION_GROUPS.some((group) => group === value);
}

export function isOptionDirection(value: unknown): value is "up" | "down" {
  return value === "up" || value === "down";
}

export type OptionErrorCode =
  | "group"
  | "required"
  | "code"
  | "code_length"
  | "key"
  | "name_length"
  | "text_length"
  | "markup"
  | "control"
  | "duplicate"
  | "incomplete"
  | "unknown"
  | "last_active"
  | "conflict"
  | "overflow"
  | "invalid";

export type Result<T> = { ok: true; value: T } | { ok: false; error: OptionErrorCode };

export interface OptionCore {
  key: string;
  nameTh: string;
  description: string;
  example: string;
  sortNo: number;
  isActive: boolean;
}

export interface OptionView extends OptionCore {
  usageCount: number;
}

export interface OptionGroupView {
  group: OptionGroup;
  total: number;
  activeCount: number;
  items: OptionView[];
  version: string;
}

export interface OptionsSnapshot {
  groups: OptionGroupView[];
  version: string;
}

export interface OptionDraft {
  key: string;
  code: string;
  nameTh: string;
  description: string;
  example: string;
  isActive: boolean;
}

export interface OptionGroupDraft {
  version: string;
  items: OptionDraft[];
}

export type OptionsDraft = Record<OptionGroup, OptionGroupDraft>;

export interface OptionChange {
  key: string;
  before: OptionCore | null;
  after: OptionCore;
}

function containsMarkup(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value) || /<\s*script\b/i.test(value);
}

function hasControlCharacter(value: string, allowNewline: boolean): boolean {
  return allowNewline
    ? /[\u0000-\u0009\u000B-\u001F\u007F]/.test(value)
    : /[\u0000-\u001F\u007F]/.test(value);
}

function normalizeMultiline(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function normalizeDepartmentCode(value: string): string {
  return value.trim().toUpperCase();
}

export function validateDepartmentCode(value: string): Result<string> {
  const code = normalizeDepartmentCode(value);
  if (!code) return { ok: false, error: "required" };
  const length = [...code].length;
  if (length < MIN_DEPARTMENT_CODE_LENGTH || length > MAX_DEPARTMENT_CODE_LENGTH) {
    return { ok: false, error: "code_length" };
  }
  if (!/^[A-Z0-9-]+$/.test(code)) return { ok: false, error: "code" };
  return { ok: true, value: code };
}

export function validateOptionKey(group: OptionGroup, value: string): Result<string> {
  if (!isOptionGroup(group)) return { ok: false, error: "group" };
  if (OPTION_DEFINITIONS[group].keyField === "code") return validateDepartmentCode(value);
  const key = value.trim();
  if (!/^\d+$/.test(key)) return { ok: false, error: "key" };
  const numeric = Number(key);
  if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric > MAX_OPTION_ID) {
    return { ok: false, error: "key" };
  }
  return { ok: true, value: String(numeric) };
}

export function validateOptionText(
  group: OptionGroup,
  value: { nameTh: string; description: string; example: string },
): Result<{ nameTh: string; description: string; example: string }> {
  if (!isOptionGroup(group)) return { ok: false, error: "group" };
  const definition = OPTION_DEFINITIONS[group];
  const nameTh = value.nameTh.trim();
  if (!nameTh) return { ok: false, error: "required" };
  if ([...nameTh].length > definition.maxNameLength) return { ok: false, error: "name_length" };

  const description = definition.supportsDescription ? normalizeMultiline(value.description) : "";
  const example = definition.supportsExample ? normalizeMultiline(value.example) : "";
  if ([...description].length > MAX_OPTION_TEXT_LENGTH || [...example].length > MAX_OPTION_TEXT_LENGTH) {
    return { ok: false, error: "text_length" };
  }
  if ([nameTh, description, example].some(containsMarkup)) return { ok: false, error: "markup" };
  if (
    hasControlCharacter(nameTh, false)
    || hasControlCharacter(description, true)
    || hasControlCharacter(example, true)
  ) {
    return { ok: false, error: "control" };
  }
  return { ok: true, value: { nameTh, description, example } };
}

export function compareOptionName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

export function compareOptionCode(left: string, right: string): boolean {
  return normalizeDepartmentCode(left) === normalizeDepartmentCode(right);
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

export function computeOptionVersion(snapshot: OptionGroupView[]): string {
  const payload = OPTION_GROUPS.map((group) => {
    const view = snapshot.find((item) => item.group === group);
    return {
      group,
      items: (view?.items ?? [])
        .map((item) => ({
          key: item.key,
          nameTh: item.nameTh,
          description: item.description,
          example: item.example,
          sortNo: item.sortNo,
          isActive: item.isActive,
        }))
        .sort((left, right) => left.key.localeCompare(right.key)),
    };
  });
  return hashText(JSON.stringify(payload));
}

export function computeGroupVersion(group: OptionGroup, items: readonly OptionCore[]): string {
  // Include the submitted order so a pure reorder cannot be overwritten by a stale client.
  const payload = {
    group,
    items: items.map((item) => ({
      key: item.key,
      nameTh: item.nameTh,
      description: item.description,
      example: item.example,
      sortNo: item.sortNo,
      isActive: item.isActive,
    })),
  };
  return hashText(JSON.stringify(payload));
}

export function validateOptionDraft(group: OptionGroup, draft: OptionDraft): Result<OptionDraft> {
  if (!isOptionGroup(group)) return { ok: false, error: "group" };
  const isDepartment = OPTION_DEFINITIONS[group].keyField === "code";
  const rawKey = draft.key.trim();
  let key = "";
  let code = "";
  if (isDepartment) {
    const keyCheck = rawKey ? validateDepartmentCode(rawKey) : validateDepartmentCode(draft.code);
    if (!keyCheck.ok) return keyCheck;
    code = keyCheck.value;
    key = rawKey ? keyCheck.value : "";
  } else if (rawKey) {
    const keyCheck = validateOptionKey(group, rawKey);
    if (!keyCheck.ok) return keyCheck;
    key = keyCheck.value;
  }
  const text = validateOptionText(group, draft);
  if (!text.ok) return text;
  return {
    ok: true,
    value: {
      key,
      code,
      nameTh: text.value.nameTh,
      description: text.value.description,
      example: text.value.example,
      isActive: Boolean(draft.isActive),
    },
  };
}

export function validateBatchShape(input: unknown): Result<OptionsDraft> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "invalid" };
  const source = input as Record<string, unknown>;
  const groups = {} as OptionsDraft;
  for (const group of OPTION_GROUPS) {
    const rawGroup = source[group];
    if (typeof rawGroup !== "object" || rawGroup === null) return { ok: false, error: "invalid" };
    const groupInput = rawGroup as Record<string, unknown>;
    if (typeof groupInput.version !== "string" || groupInput.version.length > 64) {
      return { ok: false, error: "invalid" };
    }
    if (!Array.isArray(groupInput.items) || groupInput.items.length < 1 || groupInput.items.length > MAX_OPTIONS_PER_GROUP) {
      return { ok: false, error: "invalid" };
    }
    const seenKeys = new Set<string>();
    const items: OptionDraft[] = [];
    for (const rawItem of groupInput.items) {
      if (typeof rawItem !== "object" || rawItem === null) return { ok: false, error: "invalid" };
      const item = rawItem as Record<string, unknown>;
      const draftResult = validateOptionDraft(group, {
        key: typeof item.key === "string" ? item.key : "",
        code: typeof item.code === "string" ? item.code : "",
        nameTh: typeof item.nameTh === "string" ? item.nameTh : "",
        description: typeof item.description === "string" ? item.description : "",
        example: typeof item.example === "string" ? item.example : "",
        isActive: item.isActive === true || item.isActive === 1,
      });
      if (!draftResult.ok) return draftResult;
      const draft = draftResult.value;
      const identity = draft.key || draft.code;
      if (identity) {
        if (seenKeys.has(identity)) return { ok: false, error: "duplicate" };
        seenKeys.add(identity);
      }
      items.push(draft);
    }
    for (let first = 0; first < items.length; first += 1) {
      for (let second = first + 1; second < items.length; second += 1) {
        if (compareOptionName(items[first].nameTh, items[second].nameTh)) {
          return { ok: false, error: "duplicate" };
        }
        if (OPTION_DEFINITIONS[group].keyField === "code"
          && compareOptionCode(items[first].code, items[second].code)) {
          return { ok: false, error: "duplicate" };
        }
      }
    }
    groups[group] = { version: groupInput.version, items };
  }
  return { ok: true, value: groups };
}

export function validateCompleteOrder(
  group: OptionGroup,
  current: readonly OptionCore[],
  drafts: readonly OptionDraft[],
): Result<string[]> {
  const existingKeys = new Set(current.map((item) => item.key));
  const submittedKeys = new Set<string>();
  for (const draft of drafts) {
    if (!draft.key) continue;
    if (!existingKeys.has(draft.key) || submittedKeys.has(draft.key)) {
      return { ok: false, error: draft.key ? "unknown" : "duplicate" };
    }
    submittedKeys.add(draft.key);
  }
  for (const key of existingKeys) {
    if (!submittedKeys.has(key)) return { ok: false, error: "incomplete" };
  }
  if (!drafts.some((draft) => draft.isActive)) return { ok: false, error: "last_active" };
  return { ok: true, value: drafts.map(() => "") };
}

export function nextOptionId(current: readonly OptionCore[], newCount: number): Result<number> {
  const max = current.reduce((highest, item) => {
    const numeric = Number(item.key);
    return Number.isSafeInteger(numeric) ? Math.max(highest, numeric) : highest;
  }, 0);
  if (max + newCount > MAX_OPTION_ID) return { ok: false, error: "overflow" };
  return { ok: true, value: max + 1 };
}

export function formatInactiveLabel(name: string, suffix: string): string {
  return `${name}${suffix}`;
}
