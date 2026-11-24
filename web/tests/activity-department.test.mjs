import test from "node:test";
import assert from "node:assert/strict";
import {
  getInitialMainDepartment,
  handleMainDepartmentChange,
} from "../src/lib/activity-department.ts";

test("admin without a department starts with an empty main department", () => {
  assert.equal(getInitialMainDepartment("admin", null), "");
});

test("unit user starts with their assigned department", () => {
  assert.equal(getInitialMainDepartment("unit_user", "PSUBIC"), "PSUBIC");
});

test("main department change snapshots the event value and removes a duplicate co-organizer", () => {
  let eventTarget = { value: "PSUBIC" };
  const event = {
    get currentTarget() {
      return eventTarget;
    },
  };
  let stateUpdater;

  handleMainDepartmentChange(event, (updater) => {
    stateUpdater = updater;
  });
  eventTarget = null;

  assert.deepEqual(
    stateUpdater({
      mainDepartment: "OTHER",
      coOrganizers: ["PSUBIC", "PSU"],
    }),
    {
      mainDepartment: "PSUBIC",
      coOrganizers: ["PSU"],
    },
  );
});
