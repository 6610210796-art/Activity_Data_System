import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env.local"),
});

const entries = [
  ["app.name", "app", "ชื่อระบบ", "ระบบรวบรวมข้อมูลกิจกรรม"],
  ["app.org", "app", "ชื่อหน่วยงาน", "อุทยานวิทยาศาสตร์ มหาวิทยาลัยสงขลานครินทร์"],
  ["login.title", "login", "หัวข้อหน้าเข้าสู่ระบบ", "เข้าสู่ระบบ"],
  ["login.subtitle", "login", "คำอธิบายหน้าเข้าสู่ระบบ", "กรุณาเข้าสู่ระบบด้วยบัญชีของหน่วยงาน"],
  ["login.email", "login", "ป้ายช่องอีเมล", "อีเมล"],
  ["login.email.placeholder", "login", "ตัวอย่างช่องอีเมล", "กรอกอีเมลของคุณ"],
  ["login.password", "login", "ป้ายช่องรหัสผ่าน", "รหัสผ่าน"],
  ["login.password.placeholder", "login", "ตัวอย่างช่องรหัสผ่าน", "กรอกรหัสผ่าน"],
  ["login.submit", "login", "ปุ่มเข้าสู่ระบบ", "เข้าสู่ระบบ"],
  ["login.notice", "login", "คำอธิบายสิทธิ์", "สิทธิ์การใช้งาน 2 ระดับ: ผู้ดูแลระบบจัดการข้อมูลภาพรวม และผู้ใช้ประจำหน่วยงานบันทึกข้อมูลของหน่วยงานตนเอง"],
  ["login.error.generic", "login", "ข้อความเข้าสู่ระบบไม่สำเร็จ", "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง"],
  ["login.error.server", "login", "ข้อความระบบขัดข้อง", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง"],
  ["nav.home", "navigation", "เมนูหน้าแรก", "หน้าแรก"],
  ["nav.past", "navigation", "เมนูกิจกรรมที่เกิดขึ้นแล้ว", "กิจกรรมที่เกิดขึ้นแล้ว"],
  ["nav.planned", "navigation", "เมนูกิจกรรมที่จะเกิดขึ้น", "กิจกรรมที่จะเกิดขึ้น"],
  ["nav.mine", "navigation", "เมนูรายการของฉัน", "รายการของฉัน"],
  ["nav.admin_dashboard", "navigation", "เมนูแดชบอร์ดผู้ดูแล", "แดชบอร์ดผู้ดูแล"],
  ["nav.all_activities", "navigation", "เมนูกิจกรรมทั้งหมด", "กิจกรรมทั้งหมด"],
  ["nav.users", "navigation", "เมนูจัดการผู้ใช้", "จัดการผู้ใช้"],
  ["common.logout", "button", "ปุ่มออกจากระบบ", "ออกจากระบบ"],
  ["common.role.admin", "role", "ชื่อสิทธิ์ผู้ดูแล", "ผู้ดูแลระบบ"],
  ["common.role.unit_user", "role", "ชื่อสิทธิ์ผู้ใช้หน่วยงาน", "ผู้ใช้หน่วยงาน"],
  ["home.kicker", "home", "คำโปรยหน้าแรก", "แบบฟอร์มบันทึกข้อมูล"],
  ["home.heading", "home", "หัวข้อหน้าแรก", "เลือกหัวข้อที่ต้องการกรอกข้อมูล"],
  ["home.subtitle", "home", "คำอธิบายปีงบประมาณ", "ข้อมูลกิจกรรมจะถูกนับตามปีงบประมาณ (1 ตุลาคม – 30 กันยายน) ปีงบประมาณปัจจุบันคือ {fiscalYear}"],
  ["home.card1.title", "home", "การ์ดกิจกรรมที่เกิดขึ้นแล้ว: ชื่อ", "ข้อมูลกิจกรรมเด่นที่เกิดขึ้นแล้วในไตรมาสก่อนหน้า"],
  ["home.card1.desc", "home", "การ์ดกิจกรรมที่เกิดขึ้นแล้ว: คำอธิบาย", "บันทึกกิจกรรมที่จัดเสร็จแล้ว พร้อมจำนวนผู้เข้าร่วม ผลลัพธ์ และภาพกิจกรรม"],
  ["home.card1.count", "home", "การ์ดกิจกรรมที่เกิดขึ้นแล้ว: จำนวน", "บันทึกแล้ว {count} รายการ"],
  ["home.card2.title", "home", "การ์ดกิจกรรมที่จะเกิดขึ้น: ชื่อ", "ข้อมูลกิจกรรมเด่นที่จะเกิดขึ้นในไตรมาสถัดไป"],
  ["home.card2.desc", "home", "การ์ดกิจกรรมที่จะเกิดขึ้น: คำอธิบาย", "วางแผนกิจกรรมล่วงหน้า เพื่อให้ฝ่ายยุทธศาสตร์และแผนรวบรวมเป็นปฏิทินกิจกรรม"],
  ["home.card2.count", "home", "การ์ดกิจกรรมที่จะเกิดขึ้น: จำนวน", "บันทึกแล้ว {count} รายการ"],
  ["home.card.action", "home", "ข้อความการ์ด", "กรอกข้อมูล"],
  ["home.mine_hint", "home", "คำแนะนำรายการของฉัน", "ต้องการตรวจสอบหรือแก้ไขข้อมูลที่บันทึกไว้ ไปที่เมนู รายการของฉัน"],
];

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Fill it in web/.env.local first.`);
  }
  return value;
}

const pool = mysql.createPool({
  host: required("DB_HOST"),
  port: Number(required("DB_PORT")),
  user: required("DB_USER"),
  password: process.env.DB_PASSWORD ?? "",
  database: required("DB_NAME"),
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 2,
});

try {
  for (const entry of entries) {
    await pool.execute(
      "INSERT IGNORE INTO site_content (content_key, page_group, label_th, content_value) VALUES (?, ?, ?, ?)",
      entry,
    );
  }
  console.log(`ตรวจและเพิ่มข้อความตั้งต้นที่ยังไม่มีแล้ว ${entries.length} รายการ`);
} catch (error) {
  console.error("เพิ่มข้อความตั้งต้นไม่สำเร็จ", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
