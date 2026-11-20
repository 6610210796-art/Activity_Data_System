# ระบบรวบรวมข้อมูลกิจกรรม

เว็บแอป Next.js สำหรับขั้นที่ 1: หน้าเข้าสู่ระบบและหน้าแรกที่แสดงจำนวนกิจกรรมจาก MariaDB

## ตั้งค่า

1. เปิด `web/.env.local` แล้วกำหนด `DB_USER`, `DB_PASSWORD` และ `JWT_SECRET` เอง
2. `JWT_SECRET` ต้องมีอย่างน้อย 32 ตัวอักษร
3. ตรวจให้แน่ใจว่าฐานข้อมูลมีตารางตาม `design/schema_mariadb.sql` และ `design/schema_cms_mariadb.sql` อยู่แล้ว

ค่าเริ่มต้นที่กำหนดไว้คือ `DB_HOST=localhost`, `DB_PORT=3306` และ `DB_NAME=activity_datasystem`

## คำสั่ง

รันจากโฟลเดอร์ `web/`:

```powershell
npm install
npm run seed:content
npm run admin:create
npm run dev
```

`seed:content` เพิ่มเฉพาะข้อความที่ยังไม่มีใน `site_content` และไม่เขียนทับข้อความเดิม ส่วน `admin:create` รับอีเมลและชื่อจาก terminal และรับรหัสผ่านแบบไม่แสดงบนหน้าจอ (อย่างน้อย 12 ตัวอักษร) ทั้งสองสคริปต์ใช้ prepared statements และไม่สร้างหรือแก้ไขโครงสร้างตาราง

หากลืมรหัสผ่านบัญชีเว็บ ให้รัน `node .\scripts\reset-user-password.mjs` จาก `web/` สคริปต์จะตรวจบัญชีด้วยอีเมล ขอรหัสผ่านใหม่สองครั้งแบบไม่แสดงบนหน้าจอ แล้วอัปเดตเฉพาะ bcrypt hash ใน `profiles`

เปิด [http://localhost:3000](http://localhost:3000) เพื่อทดลองระบบ บัญชีที่สร้างด้วยสคริปต์ใช้เข้าสู่ระบบได้ทันที

## หมายเหตุด้านความปลอดภัย

- รหัสผ่านเก็บเป็น bcrypt hash และ JWT อยู่ใน cookie แบบ `httpOnly`, `sameSite=lax` และหมดอายุใน 7 วัน
- การจำกัดการเข้าสู่ระบบผิด 5 ครั้งภายใน 15 นาทีเก็บสถานะในหน่วยความจำของ process; การเริ่ม process ใหม่จะล้างสถานะนี้
- `.env.local` และ `node_modules` ถูกกำหนดให้ Git ignore
