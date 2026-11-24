export type MainDepartmentRole = "admin" | "unit_user";

export interface MainDepartmentFormValues {
  mainDepartment: string;
  coOrganizers: string[];
}

export function getInitialMainDepartment(
  role: MainDepartmentRole,
  departmentCode: string | null,
): string {
  return role === "unit_user" ? departmentCode ?? "" : "";
}

export function updateMainDepartment(
  current: MainDepartmentFormValues,
  departmentCode: string,
): Pick<MainDepartmentFormValues, "mainDepartment" | "coOrganizers"> {
  return {
    mainDepartment: departmentCode,
    coOrganizers: current.coOrganizers.filter((code) => code !== departmentCode),
  };
}

export function handleMainDepartmentChange<T extends MainDepartmentFormValues>(
  event: { currentTarget: { value: string } },
  setValues: (updater: (current: T) => T) => void,
): void {
  const departmentCode = event.currentTarget.value;
  setValues((current) => ({
    ...current,
    ...updateMainDepartment(current, departmentCode),
  }));
}
