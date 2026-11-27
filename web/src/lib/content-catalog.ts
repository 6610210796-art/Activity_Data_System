export interface ContentMetadata {
  pageGroup: string;
  labelTh: string;
}

// This catalog mirrors the page_group and label_th values inserted by seed-site-content.mjs.
// Rows already in site_content remain authoritative; it is used for fallback-only keys.
export const CONTENT_METADATA: Record<string, ContentMetadata> = {
  "app.name": { pageGroup: "app", labelTh: "ชื่อระบบ" },
  "app.org": { pageGroup: "app", labelTh: "ชื่อหน่วยงาน" },
  "login.title": { pageGroup: "login", labelTh: "หัวข้อหน้าเข้าสู่ระบบ" },
  "login.subtitle": { pageGroup: "login", labelTh: "คำอธิบายหน้าเข้าสู่ระบบ" },
  "nav.home": { pageGroup: "navigation", labelTh: "เมนูหน้าแรก" },
  "nav.past": { pageGroup: "navigation", labelTh: "เมนูกิจกรรมที่เกิดขึ้นแล้ว" },
  "nav.planned": { pageGroup: "navigation", labelTh: "เมนูกิจกรรมที่จะเกิดขึ้น" },
  "nav.mine": { pageGroup: "navigation", labelTh: "เมนูรายการของฉัน" },
  "nav.admin_dashboard": { pageGroup: "navigation", labelTh: "เมนูแดชบอร์ดผู้ดูแล" },
  "nav.all_activities": { pageGroup: "navigation", labelTh: "เมนูกิจกรรมทั้งหมด" },
  "nav.users": { pageGroup: "navigation", labelTh: "เมนูจัดการผู้ใช้" },
  "common.logout": { pageGroup: "button", labelTh: "ปุ่มออกจากระบบ" },
};

const PREFIX_GROUPS: Record<string, string> = {
  app: "app",
  login: "login",
  register: "register",
  nav: "navigation",
  common: "button",
  account: "account",
  home: "home",
  form1: "form1",
  form2: "form2",
  form: "form_shared",
  dashboard: "dashboard",
  all: "all",
  my: "my",
  archive: "archive",
  users: "users",
  content: "content",
  err: "error",
  btn: "button",
};

const GROUP_LABELS: Record<string, string> = {
  app: "ระบบ",
  login: "หน้า Login",
  register: "ลงทะเบียน",
  navigation: "เมนู",
  button: "ปุ่มและเมนู",
  account: "บัญชีผู้ใช้",
  home: "หน้าแรก",
  form1: "ฟอร์ม 1 กิจกรรมที่เกิดขึ้นแล้ว",
  form2: "ฟอร์ม 2 กิจกรรมที่จะเกิดขึ้น",
  form_shared: "ข้อความร่วมของแบบฟอร์ม",
  error: "ข้อความแจ้งเตือน (error)",
  admin_activities: "กิจกรรมทั้งหมด",
  role: "สิทธิ์",
  dashboard: "แดชบอร์ด",
  all: "กิจกรรมทั้งหมด",
  my: "รายการของฉัน",
  archive: "รายการที่จัดเก็บ",
  users: "จัดการผู้ใช้",
  content: "จัดการเนื้อหา",
};

export function getContentMetadata(key: string, fallback: string): ContentMetadata {
  return CONTENT_METADATA[key] ?? {
    pageGroup: PREFIX_GROUPS[key.split(".")[0]] ?? key.split(".")[0] ?? "other",
    labelTh: fallback,
  };
}

export function getContentGroupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}
