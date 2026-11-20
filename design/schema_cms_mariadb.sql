-- =====================================================
-- ส่วนเพิ่มเติม: ระบบจัดการเนื้อหา (CMS) + แก้ตารางเดิม
-- สำหรับ MariaDB 10.7+ / HeidiSQL
-- ต้องรัน schema_mariadb.sql ก่อน แล้วค่อยรันไฟล์นี้ทับ
-- รันซ้ำได้ปลอดภัย (ใช้ IF NOT EXISTS / INSERT IGNORE) และไม่ลบข้อมูลเดิม
-- =====================================================

SET NAMES utf8mb4;
USE activity_datasystem;

-- ---------- 1) แก้ตารางเดิม (เพิ่มคอลัมน์) ----------

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE activity_types
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_no   INT NOT NULL DEFAULT 0;

ALTER TABLE participant_types
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_no   INT NOT NULL DEFAULT 0;

-- ตั้งลำดับเริ่มต้นตามเลข id (รันเฉพาะแถวที่ยังเป็น 0)
UPDATE activity_types    SET sort_no = id WHERE sort_no = 0;
UPDATE participant_types SET sort_no = id WHERE sort_no = 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL DEFAULT NULL;

-- ลบแบบซ่อน (soft delete): แถวที่ deleted_at ไม่ว่าง = ถูกลบ
ALTER TABLE planned_activities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL,
  ADD INDEX IF NOT EXISTS idx_pl_deleted (deleted_at);

ALTER TABLE past_activities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL,
  ADD INDEX IF NOT EXISTS idx_pa_deleted (deleted_at);

-- ---------- 2) ตารางใหม่: จัดการเนื้อหา ----------

CREATE TABLE IF NOT EXISTS site_content (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  content_key   VARCHAR(120) NOT NULL UNIQUE,   -- เช่น home.title
  page_group    VARCHAR(50)  NOT NULL,          -- ใช้จัดหมวดในหน้าแอดมิน เช่น home, form1, form2, error, button
  label_th      VARCHAR(200) NOT NULL,          -- ชื่อที่แอดมินเห็นว่าข้อความนี้คืออะไร
  content_value TEXT NOT NULL,
  updated_by    UUID NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sc_user FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_sc_group (page_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_assets (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  asset_key   VARCHAR(80)  NOT NULL UNIQUE,     -- เช่น logo, hero_bg
  label_th    VARCHAR(200) NOT NULL,
  file_path   VARCHAR(500) NOT NULL,
  alt_text    VARCHAR(255) NULL,
  uploaded_by UUID NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sa_user FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_history (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  content_id INT UNSIGNED NOT NULL,
  old_value  TEXT NULL,
  new_value  TEXT NULL,
  changed_by UUID NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ch_content FOREIGN KEY (content_id) REFERENCES site_content(id) ON DELETE CASCADE,
  CONSTRAINT fk_ch_user    FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_ch_content (content_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title      VARCHAR(200) NOT NULL,
  body       TEXT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NULL,                          -- NULL = ไม่มีวันหมดอายุ
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_by UUID NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ann_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT fk_ann_user FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 3) ตารางทางเลือก (ถ้าไม่ต้องการ ลบส่วนนี้ทิ้งได้) ----------

CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,           -- เก็บ SHA-256 ของโทเคน ไม่เก็บโทเคนจริง
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    UUID NULL,
  action     VARCHAR(60) NOT NULL,               -- เช่น user.disable, activity.delete, export.excel
  entity     VARCHAR(60) NULL,
  entity_id  VARCHAR(60) NULL,
  detail     TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_al_time (created_at),
  INDEX idx_al_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 4) Trigger: บันทึกประวัติเมื่อแอดมินแก้ข้อความ ----------

DELIMITER $$
DROP TRIGGER IF EXISTS trg_site_content_au$$
CREATE TRIGGER trg_site_content_au AFTER UPDATE ON site_content FOR EACH ROW
BEGIN
  IF NOT (OLD.content_value <=> NEW.content_value) THEN
    INSERT INTO content_history (content_id, old_value, new_value, changed_by)
    VALUES (NEW.id, OLD.content_value, NEW.content_value, NEW.updated_by);
  END IF;
END$$
DELIMITER ;

-- ---------- 5) ข้อความตั้งต้น (INSERT IGNORE = ไม่เขียนทับสิ่งที่แอดมินแก้แล้ว) ----------

INSERT IGNORE INTO site_content (content_key, page_group, label_th, content_value) VALUES
 ('app.name',                 'app',    'ชื่อระบบ',                         'ระบบรวบรวมข้อมูลกิจกรรม'),
 ('app.org',                  'app',    'ชื่อหน่วยงาน',                     'อุทยานวิทยาศาสตร์ มหาวิทยาลัยสงขลานครินทร์'),
 ('login.title',              'login',  'หัวข้อหน้าเข้าสู่ระบบ',            'เข้าสู่ระบบ'),
 ('home.heading',             'home',   'หัวข้อหน้าแรก',                    'เลือกหัวข้อที่ต้องการกรอกข้อมูล'),
 ('home.card1.title',         'home',   'การ์ด 1: ชื่อ',                   'ข้อมูลกิจกรรมเด่นที่เกิดขึ้นแล้วในไตรมาสก่อนหน้า'),
 ('home.card1.desc',          'home',   'การ์ด 1: คำอธิบาย',               'บันทึกกิจกรรมที่จัดเสร็จแล้ว พร้อมจำนวนผู้เข้าร่วม ผลลัพธ์ และภาพกิจกรรม'),
 ('home.card2.title',         'home',   'การ์ด 2: ชื่อ',                   'ข้อมูลกิจกรรมเด่นที่จะเกิดขึ้นในไตรมาสถัดไป'),
 ('home.card2.desc',          'home',   'การ์ด 2: คำอธิบาย',               'วางแผนกิจกรรมล่วงหน้า เพื่อให้ฝ่ายยุทธศาสตร์และแผนรวบรวมเป็นปฏิทินกิจกรรม'),
 ('form1.title',              'form1',  'ฟอร์ม 1: หัวข้อ',                 'กิจกรรมที่เกิดขึ้นแล้ว'),
 ('form1.mode.planned',       'form1',  'ฟอร์ม 1: ปุ่มเลือกจากแผน',        'เลือกจากกิจกรรมที่เคยวางแผนไว้'),
 ('form1.mode.new',           'form1',  'ฟอร์ม 1: ปุ่มสร้างใหม่',          'สร้างใหม่'),
 ('form1.help.participants',  'form1',  'ฟอร์ม 1: คำอธิบายจำนวนผู้เข้าร่วม','ไม่นับรวมทีมจัด'),
 ('form1.help.satisfaction',  'form1',  'ฟอร์ม 1: คำอธิบายความพึงพอใจ',    'ถ้าแบบประเมินเต็ม 5 ให้ใช้ คะแนน ÷ 5 × 100'),
 ('form1.help.images',        'form1',  'ฟอร์ม 1: คำอธิบายอัปโหลดภาพ',     'อย่างน้อย 1 ภาพ สูงสุด 5 ภาพ JPG/PNG ไม่เกิน 5 MB ต่อภาพ'),
 ('form1.consent',            'form1',  'ฟอร์ม 1: ข้อความยืนยันสิทธิ์ภาพ',  'ภาพที่แนบได้รับความยินยอมให้เผยแพร่แล้ว'),
 ('form2.title',              'form2',  'ฟอร์ม 2: หัวข้อ',                 'กิจกรรมที่จะเกิดขึ้น'),
 ('form2.help.banner',        'form2',  'ฟอร์ม 2: คำอธิบายภาพ Banner',     '1 ภาพ JPG/PNG ไม่เกิน 5 MB สัดส่วนภาพ 16:9'),
 ('btn.save',                 'button', 'ปุ่มบันทึก',                       'บันทึก'),
 ('btn.cancel',               'button', 'ปุ่มยกเลิก',                       'ยกเลิก'),
 ('err.required',             'error',  'แจ้งเตือน: ช่องบังคับ',           'กรุณากรอกข้อมูลช่องนี้'),
 ('err.date.quarter',         'error',  'แจ้งเตือน: วันที่นอกไตรมาส',      'วันที่ต้องอยู่ในไตรมาสและปีงบประมาณที่เลือก'),
 ('err.co.duplicate',         'error',  'แจ้งเตือน: หน่วยร่วมจัดซ้ำ',      'หน่วยงานร่วมจัดต้องไม่ซ้ำกับหน่วยงานหลัก');

-- ---------- 6) ตัวอย่างคำสั่งที่เว็บจะใช้ (อ่านประกอบ ไม่ต้องรัน) ----------
-- ดึงข้อความทั้งหน้า:     SELECT content_key, content_value FROM site_content WHERE page_group = 'home';
-- แอดมินแก้ข้อความ:       UPDATE site_content SET content_value = 'ข้อความใหม่', updated_by = '<uuid แอดมิน>' WHERE content_key = 'home.heading';
-- ดูประวัติการแก้:         SELECT * FROM content_history WHERE content_id = 1 ORDER BY changed_at DESC;
-- ซ่อนรายการ (ลบแบบซ่อน): UPDATE past_activities SET deleted_at = NOW() WHERE id = 1;
-- ดึงเฉพาะที่ไม่ถูกลบ:     SELECT * FROM past_activities WHERE deleted_at IS NULL;
-- ประกาศที่ยังแสดงอยู่:    SELECT * FROM announcements WHERE is_active = 1 AND start_date <= CURDATE() AND (end_date IS NULL OR end_date >= CURDATE());
