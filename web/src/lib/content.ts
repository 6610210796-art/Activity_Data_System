import "server-only";

import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";

export const CONTENT_FALLBACKS = {
  "app.name": "ระบบรวบรวมข้อมูลกิจกรรม",
  "app.org": "อุทยานวิทยาศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
  "login.title": "เข้าสู่ระบบ",
  "login.subtitle": "ระบบรวบรวมข้อมูลกิจกรรม",
  "login.email": "อีเมล",
  "login.email.placeholder": "กรอกอีเมลของคุณ",
  "login.password": "รหัสผ่าน",
  "login.password.placeholder": "กรอกรหัสผ่าน",
  "login.submit": "เข้าสู่ระบบ",
  "login.notice":
    "สิทธิ์การใช้งาน 2 ระดับ: ผู้ดูแลระบบจัดการข้อมูลภาพรวม และผู้ใช้ประจำหน่วยงานบันทึกข้อมูลของหน่วยงานตนเอง",
  "login.error.generic": "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง",
  "login.error.server": "ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง",
  "nav.home": "หน้าแรก",
  "nav.past": "กิจกรรมที่เกิดขึ้นแล้ว",
  "nav.planned": "กิจกรรมที่จะเกิดขึ้น",
  "nav.mine": "รายการของฉัน",
  "nav.admin_dashboard": "แดชบอร์ดผู้ดูแล",
  "nav.all_activities": "กิจกรรมทั้งหมด",
  "nav.users": "จัดการผู้ใช้",
  "common.logout": "ออกจากระบบ",
  "common.role.admin": "ผู้ดูแลระบบ",
  "common.role.unit_user": "ผู้ใช้หน่วยงาน",
  "home.kicker": "แบบฟอร์มบันทึกข้อมูล",
  "home.heading": "เลือกหัวข้อที่ต้องการกรอกข้อมูล",
  "home.subtitle":
    "ข้อมูลกิจกรรมจะถูกนับตามปีงบประมาณ (1 ตุลาคม – 30 กันยายน) ปีงบประมาณปัจจุบันคือ {fiscalYear}",
  "home.card1.title":
    "ข้อมูลกิจกรรมเด่นที่เกิดขึ้นแล้วในไตรมาสก่อนหน้า",
  "home.card1.desc":
    "บันทึกกิจกรรมที่จัดเสร็จแล้ว พร้อมจำนวนผู้เข้าร่วม ผลลัพธ์ และภาพกิจกรรม",
  "home.card1.count": "บันทึกแล้ว {count} รายการ",
  "home.card2.title":
    "ข้อมูลกิจกรรมเด่นที่จะเกิดขึ้นในไตรมาสถัดไป",
  "home.card2.desc":
    "วางแผนกิจกรรมล่วงหน้า เพื่อให้ฝ่ายยุทธศาสตร์และแผนรวบรวมเป็นปฏิทินกิจกรรม",
  "home.card2.count": "บันทึกแล้ว {count} รายการ",
  "home.card.action": "กรอกข้อมูล",
  "home.mine_hint":
    "ต้องการตรวจสอบหรือแก้ไขข้อมูลที่บันทึกไว้ ไปที่เมนู รายการของฉัน",
} as const;

export type ContentKey = keyof typeof CONTENT_FALLBACKS;
export type SiteContent = Record<ContentKey, string>;

interface ContentRow extends RowDataPacket {
  content_key: string;
  content_value: string;
}

export async function getSiteContent(
  keys: readonly ContentKey[],
): Promise<SiteContent> {
  const content: SiteContent = { ...CONTENT_FALLBACKS };
  if (keys.length === 0) {
    return content;
  }

  const [rows] = await getDb().execute<ContentRow[]>(
    "SELECT content_key, content_value FROM site_content",
    [],
  );

  for (const row of rows) {
    if (row.content_value && Object.hasOwn(CONTENT_FALLBACKS, row.content_key)) {
      content[row.content_key as ContentKey] = row.content_value;
    }
  }

  return content;
}

export function formatContent(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
