import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  authorizeAdminUsers,
} from "../src/lib/admin-users-policy.ts";
import {
  resolveAuthenticatedProfile,
} from "../src/lib/auth-profile.ts";
import {
  checkUserLockProtection,
  validateManagedProfile,
} from "../src/lib/user-management.ts";
import {
  generateTemporaryPassword,
  normalizeEmail,
  validatePasswordPolicy,
} from "../src/lib/password-security.ts";
import {
  toSafeAdminUser,
} from "../src/lib/admin-users-data-view.ts";
import { lockActiveAdmins, lockAndVerifyAdminActor } from "../src/lib/admin-user-lock.ts";
import { writeUserAudit } from "../src/lib/user-audit.ts";

const endpoints = [
  ["GET /api/admin/users", "list"],
  ["POST /api/admin/users", "create"],
  ["PATCH /api/admin/users/:id", "update"],
  ["POST /api/admin/users/generate", "generate password"],
];

test("unit_user and unauthenticated requests are rejected at every users API guard", async (t) => {
  for (const [endpoint, operation] of endpoints) {
    await t.test(endpoint, () => {
      assert.deepEqual(authorizeAdminUsers({ id: "u-1", role: "unit_user" }), {
        allowed: false,
        status: 403,
        error: "forbidden",
      });
      assert.deepEqual(authorizeAdminUsers(null), {
        allowed: false,
        status: 401,
        error: "session",
      });
      assert.deepEqual(authorizeAdminUsers({ id: "a-1", role: "admin" }), {
        allowed: true,
        actor: { id: "a-1", role: "admin" },
      });
      assert.ok(operation.length > 0);
    });
  }
});

test("every users API route calls the shared server-side authorization guard", async () => {
  const routeFiles = [
    ["../src/app/api/admin/users/route.ts", 2],
    ["../src/app/api/admin/users/[id]/route.ts", 1],
    ["../src/app/api/admin/users/generate/route.ts", 1],
  ];
  for (const [relativePath, expectedCalls] of routeFiles) {
    const source = await readFile(resolve(import.meta.dirname, relativePath), "utf8");
    assert.match(source, /import \{ authorizeAdminUsers \} from "@\/lib\/admin-users-policy"/);
    assert.equal((source.match(/authorizeAdminUsers\(actor\)/g) ?? []).length, expectedCalls);
  }
});

test("server routes write all required user audit action names", async () => {
  const adminRoute = await readFile(resolve(import.meta.dirname, "../src/app/api/admin/users/route.ts"), "utf8");
  const userRoute = await readFile(resolve(import.meta.dirname, "../src/app/api/admin/users/[id]/route.ts"), "utf8");
  const passwordRoute = await readFile(resolve(import.meta.dirname, "../src/app/api/account/password/route.ts"), "utf8");
  assert.match(adminRoute, /action: "user\.create"/);
  for (const action of ["update_role", "update_department", "update_profile", "disable", "enable", "reset_password"]) {
    assert.ok(userRoute.includes(`user.${action}`), `missing user.${action}`);
  }
  assert.match(passwordRoute, /action: "user\.change_password"/);
});

test("new management text keys have database seed values and code fallbacks", async () => {
  const content = await readFile(resolve(import.meta.dirname, "../src/lib/content.ts"), "utf8");
  const seed = await readFile(resolve(import.meta.dirname, "../scripts/seed-site-content.mjs"), "utf8");
  const keys = [
    "account.password.confirmation", "account.password.locked", "account.password.current.invalid",
    "account.password.same", "account.password.policy", "account.password.session",
    "users.search.submit", "users.pagination.previous", "users.pagination.next",
    "users.department.select", "users.password.auto_placeholder", "users.menu.label",
    "users.modal.close", "users.confirm.change_role", "users.confirm.change_role_department",
    "users.confirm.change_department", "users.confirm.disable", "users.confirm.enable",
    "users.self.role", "users.self.reset", "users.self.disable", "users.success.profile",
    "users.success.saved", "users.success.copied", "users.error.validation",
    "users.error.email_invalid", "users.error.email_duplicate", "users.error.department_invalid",
    "users.error.department_required", "users.error.lock_protection", "users.error.password_policy",
    "users.error.session", "users.error.invalid", "users.error.server",
  ];
  for (const key of keys) {
    assert.ok(content.includes(`"${key}"`), `missing fallback for ${key}`);
    assert.ok(seed.includes(`"${key}"`), `missing seed value for ${key}`);
  }
});

test("self disable and self role reduction are refused", () => {
  const actor = { id: "admin-1", role: "admin", department_code: null, is_active: 1 };
  const base = {
    actorId: actor.id,
    targetId: actor.id,
    targetBefore: actor,
    activeAdminCount: 2,
    targetAfterDepartment: null,
  };
  assert.equal(checkUserLockProtection({
    ...base,
    targetAfterRole: "admin",
    targetAfterActive: false,
  }).ok, false);
  assert.equal(checkUserLockProtection({
    ...base,
    targetAfterRole: "unit_user",
    targetAfterActive: true,
  }).ok, false);
});

test("the last active admin cannot be disabled or demoted", () => {
  const targetBefore = { id: "admin-2", role: "admin", department_code: null, is_active: 1 };
  assert.equal(checkUserLockProtection({
    actorId: "admin-1",
    targetId: "admin-2",
    targetBefore,
    targetAfterRole: "admin",
    targetAfterDepartment: null,
    targetAfterActive: false,
    activeAdminCount: 1,
  }).ok, false);
  assert.equal(checkUserLockProtection({
    actorId: "admin-1",
    targetId: "admin-2",
    targetBefore,
    targetAfterRole: "unit_user",
    targetAfterDepartment: "D1",
    targetAfterActive: true,
    activeAdminCount: 1,
  }).ok, false);
});

test("concurrent last-admin demotions serialize and only one may succeed", async () => {
  const active = new Set(["admin-a", "admin-b"]);
  let lockHeld = false;
  const waiters = [];
  const makeConnection = () => {
    let ownsLock = false;
    const release = () => {
      ownsLock = false;
      const next = waiters.shift();
      if (next) next();
      else lockHeld = false;
    };
    return {
      async execute(sql, values) {
        assert.match(sql, /SELECT id FROM profiles WHERE role = \? AND is_active = \? ORDER BY id FOR UPDATE/);
        assert.deepEqual(values, ["admin", 1]);
        if (lockHeld) await new Promise((resolve) => waiters.push(resolve));
        lockHeld = true;
        ownsLock = true;
        return [[...active].sort().map((id) => ({ id })), []];
      },
      async commit() { if (ownsLock) release(); },
      async rollback() { if (ownsLock) release(); },
    };
  };
  async function demote(actorId, targetId) {
    const connection = makeConnection();
    const count = await lockActiveAdmins(connection);
    const result = checkUserLockProtection({
      actorId,
      targetId,
      targetBefore: {
        id: targetId,
        role: "admin",
        department_code: null,
        is_active: 1,
      },
      targetAfterRole: "unit_user",
      targetAfterDepartment: "D1",
      targetAfterActive: true,
      activeAdminCount: count,
    });
    if (result.ok) active.delete(targetId);
    if (result.ok) await connection.commit();
    else await connection.rollback();
    return result.ok;
  }
  const outcomes = await Promise.all([
    demote("admin-a", "admin-b"),
    demote("admin-b", "admin-a"),
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(active.size, 1);
});

test("unit_user always requires an assigned department", () => {
  assert.equal(validateManagedProfile("unit_user", null), "ผู้ใช้สิทธิ์หน่วยงานต้องสังกัดหน่วยงาน");
  assert.equal(validateManagedProfile("unit_user", ""), "ผู้ใช้สิทธิ์หน่วยงานต้องสังกัดหน่วยงาน");
  assert.equal(validateManagedProfile("unit_user", "D1"), null);
  assert.equal(validateManagedProfile("admin", null), null);
});

test("email comparison normalizes case before the parameterized duplicate lookup", () => {
  assert.equal(normalizeEmail("  Person@Example.test "), "person@example.test");
  assert.equal(normalizeEmail("Person@Example.test"), normalizeEmail("person@example.test"));
});

test("create and update duplicate-email checks are case-insensitive and parameterized", async () => {
  const createSource = await readFile(resolve(import.meta.dirname, "../src/app/api/admin/users/route.ts"), "utf8");
  const updateSource = await readFile(resolve(import.meta.dirname, "../src/app/api/admin/users/[id]/route.ts"), "utf8");
  const schema = await readFile(resolve(import.meta.dirname, "../../design/schema_mariadb.sql"), "utf8");
  assert.match(createSource, /LOWER\(email\) = LOWER\(\?\)/);
  assert.match(updateSource, /LOWER\(email\) = LOWER\(\?\)/);
  assert.match(schema, /DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/);
});

test("inactive profiles are rejected even when the JWT subject is still valid", () => {
  const currentDatabaseProfile = {
    id: "u-1",
    email: "person@example.test",
    full_name: "Person",
    role: "unit_user",
    department_code: "D1",
    is_active: 0,
  };
  assert.equal(resolveAuthenticatedProfile(currentDatabaseProfile), null);
});

test("a role change in the database is reflected on the next auth lookup", () => {
  const currentDatabaseProfile = {
    id: "u-1",
    email: "person@example.test",
    full_name: "Person",
    role: "admin",
    department_code: null,
    is_active: 1,
  };
  assert.equal(resolveAuthenticatedProfile(currentDatabaseProfile).role, "admin");
});

test("admin mutations recheck the acting account inside the transaction", async () => {
  for (const [row, expected] of [
    [undefined, "session"],
    [{ role: "admin", is_active: 0 }, "session"],
    [{ role: "unit_user", is_active: 1 }, "forbidden"],
    [{ role: "admin", is_active: 1 }, null],
  ]) {
    const fakeConnection = {
      async execute(sql, values) {
        assert.match(sql, /SELECT role, is_active FROM profiles WHERE id = \? LIMIT 1 FOR UPDATE/);
        assert.deepEqual(values, ["admin-1"]);
        return [[...(row ? [row] : [])], []];
      },
    };
    assert.equal(await lockAndVerifyAdminActor(fakeConnection, "admin-1"), expected);
  }
});

test("user response mapping never exposes password_hash", () => {
  const response = toSafeAdminUser({
    id: "u-1",
    full_name: "Person",
    email: "person@example.test",
    role: "unit_user",
    department_code: "D1",
    department_name: "Unit",
    last_login_at: null,
    is_active: 1,
    created_at: "2026-11-24 10:00:00",
    password_hash: "$2b$12$must-not-escape",
  });
  assert.equal(Object.hasOwn(response, "password_hash"), false);
  assert.equal(JSON.stringify(response).includes("must-not-escape"), false);
});

test("admin list query and all user API responses avoid password_hash", async () => {
  const dataSource = await readFile(resolve(import.meta.dirname, "../src/lib/admin-users-data.ts"), "utf8");
  const createSource = await readFile(resolve(import.meta.dirname, "../src/app/api/admin/users/route.ts"), "utf8");
  const updateSource = await readFile(resolve(import.meta.dirname, "../src/app/api/admin/users/[id]/route.ts"), "utf8");
  assert.doesNotMatch(dataSource, /SELECT[^`;]*password_hash/s);
  assert.doesNotMatch(createSource, /password_hash\s*:/);
  assert.doesNotMatch(updateSource, /password_hash\s*:/);
});

test("temporary passwords meet length and character policy without weak randomness", () => {
  const password = generateTemporaryPassword(12);
  assert.ok(password.length >= 12);
  assert.match(password, /^[abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[2-9]/);
  assert.equal(validatePasswordPolicy(password), null);
  assert.equal(validatePasswordPolicy("short"), "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร");
});

test("all user audit actions write before-to-after detail without password data", async () => {
  const actions = [
    "user.create",
    "user.update_role",
    "user.update_department",
    "user.update_profile",
    "user.disable",
    "user.enable",
    "user.reset_password",
    "user.change_password",
  ];
  const inserted = [];
  const fakeConnection = {
    async execute(sql, values) {
      assert.match(sql, /INSERT INTO audit_logs/);
      inserted.push(values);
      return [{ affectedRows: 1 }, []];
    },
  };
  for (const action of actions) {
    await writeUserAudit(fakeConnection, {
      actorId: "admin-1",
      action,
      entityId: "user-2",
      before: action.includes("password") ? { credential_state: "existing" } : { role: "unit_user" },
      after: action.includes("password") ? { credential_state: "changed" } : { role: "admin" },
      ipAddress: "127.0.0.1",
    });
  }
  assert.deepEqual(inserted.map((values) => values[1]), actions);
  for (const values of inserted) {
    const detail = JSON.parse(values[3]);
    assert.ok(Object.hasOwn(detail, "before"));
    assert.ok(Object.hasOwn(detail, "after"));
    assert.equal(values.join(" ").includes("password_hash"), false);
    assert.equal(values.join(" ").includes("example-password"), false);
  }
  await assert.rejects(
    writeUserAudit(fakeConnection, {
      actorId: "admin-1",
      action: "user.reset_password",
      entityId: "user-2",
      before: {},
      after: { password_hash: "$2b$12$secret" },
      ipAddress: null,
    }),
    /Credential fields cannot be written/,
  );
});
