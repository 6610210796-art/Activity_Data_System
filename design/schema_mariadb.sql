-- =====================================================
-- ระบบรวบรวมข้อมูลกิจกรรม อุทยานวิทยาศาสตร์ ม.อ.
-- สำหรับ MariaDB 10.7+ (ทดสอบแนวทางกับ 12.x) / HeidiSQL
-- ปีงบประมาณใช้ พ.ศ. เช่น ต.ค. 2568 – ก.ย. 2569 = ปีงบ 2569
-- วิธีรัน: เปิดไฟล์ด้วย UTF-8 แล้วกด "รันทั้งหมด" (F9) ใน HeidiSQL
-- =====================================================

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS activity_datasystem
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE activity_datasystem;

-- ลบตารางเก่า (รวม 3 ตารางที่สร้างไปแล้ว) เพื่อสร้างใหม่ให้สะอาด
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS past_activity_images, past_co_organizers, past_activities,
  planned_co_organizers, planned_activities, profiles,
  quarters, participant_types, activity_types, departments;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------- 1) ตาราง Master ----------

CREATE TABLE departments (
  code     VARCHAR(20)  NOT NULL PRIMARY KEY,
  name_th  VARCHAR(200) NOT NULL,
  sort_no  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_types (
  id          SMALLINT NOT NULL PRIMARY KEY,
  name_th     VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  example     TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE participant_types (
  id      SMALLINT NOT NULL PRIMARY KEY,
  name_th VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quarters (
  no          TINYINT NOT NULL PRIMARY KEY,
  label_th    VARCHAR(50) NOT NULL,
  start_month TINYINT NOT NULL,
  end_month   TINYINT NOT NULL,
  CONSTRAINT chk_quarter_no CHECK (no BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2) ผู้ใช้ ----------

CREATE TABLE profiles (
  id              UUID NOT NULL DEFAULT UUID() PRIMARY KEY,
  email           VARCHAR(190) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,          -- เก็บแบบ hash (bcrypt/argon2) เท่านั้น
  full_name       VARCHAR(150) NOT NULL,
  role            ENUM('admin','unit_user') NOT NULL,
  department_code VARCHAR(20) NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prof_dept FOREIGN KEY (department_code) REFERENCES departments(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 3) ฟอร์ม 2: กิจกรรมที่จะเกิดขึ้น ----------

CREATE TABLE planned_activities (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fiscal_year           SMALLINT NOT NULL,
  quarter_no            TINYINT NOT NULL,
  title                 VARCHAR(150) NOT NULL,
  main_department       VARCHAR(20) NOT NULL,
  activity_type_id      SMALLINT NOT NULL,
  participant_type_id   SMALLINT NOT NULL,
  date_status           ENUM('confirmed','unconfirmed') NOT NULL,
  expected_start        DATE NOT NULL,
  expected_end          DATE NOT NULL,
  expected_participants INT NOT NULL,
  banner_path           VARCHAR(500) NULL,
  location              VARCHAR(255) NULL,
  ref_link              VARCHAR(500) NULL,
  created_by            UUID NOT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_pl_dates CHECK (expected_end >= expected_start),
  CONSTRAINT chk_pl_cnt   CHECK (expected_participants >= 1),
  CONSTRAINT fk_pl_q      FOREIGN KEY (quarter_no)          REFERENCES quarters(no),
  CONSTRAINT fk_pl_dept   FOREIGN KEY (main_department)     REFERENCES departments(code),
  CONSTRAINT fk_pl_type   FOREIGN KEY (activity_type_id)    REFERENCES activity_types(id),
  CONSTRAINT fk_pl_ptype  FOREIGN KEY (participant_type_id) REFERENCES participant_types(id),
  CONSTRAINT fk_pl_user   FOREIGN KEY (created_by)          REFERENCES profiles(id),
  INDEX idx_pl_filter (fiscal_year, quarter_no, main_department, activity_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE planned_co_organizers (
  planned_id      BIGINT UNSIGNED NOT NULL,
  department_code VARCHAR(20) NOT NULL,
  PRIMARY KEY (planned_id, department_code),
  CONSTRAINT fk_plco_act  FOREIGN KEY (planned_id)      REFERENCES planned_activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_plco_dept FOREIGN KEY (department_code) REFERENCES departments(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 4) ฟอร์ม 1: กิจกรรมที่เกิดขึ้นแล้ว ----------

CREATE TABLE past_activities (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  planned_id           BIGINT UNSIGNED NULL,
  fiscal_year          SMALLINT NOT NULL,
  quarter_no           TINYINT NOT NULL,
  title                VARCHAR(150) NOT NULL,
  main_department      VARCHAR(20) NOT NULL,
  activity_type_id     SMALLINT NOT NULL,
  participant_type_id  SMALLINT NOT NULL,
  start_date           DATE NOT NULL,
  end_date             DATE NOT NULL,
  total_participants   INT NOT NULL,
  result_summary       VARCHAR(500) NULL,
  satisfaction_percent DECIMAL(4,1) NULL,
  image_consent        TINYINT(1) NOT NULL,
  location             VARCHAR(255) NULL,
  ref_link             VARCHAR(500) NULL,
  created_by           UUID NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_pa_dates   CHECK (end_date >= start_date),
  CONSTRAINT chk_pa_cnt     CHECK (total_participants >= 1),
  CONSTRAINT chk_pa_sat     CHECK (satisfaction_percent IS NULL OR satisfaction_percent BETWEEN 0 AND 100),
  CONSTRAINT chk_pa_consent CHECK (image_consent = 1),
  CONSTRAINT fk_pa_plan  FOREIGN KEY (planned_id)          REFERENCES planned_activities(id) ON DELETE SET NULL,
  CONSTRAINT fk_pa_q     FOREIGN KEY (quarter_no)          REFERENCES quarters(no),
  CONSTRAINT fk_pa_dept  FOREIGN KEY (main_department)     REFERENCES departments(code),
  CONSTRAINT fk_pa_type  FOREIGN KEY (activity_type_id)    REFERENCES activity_types(id),
  CONSTRAINT fk_pa_ptype FOREIGN KEY (participant_type_id) REFERENCES participant_types(id),
  CONSTRAINT fk_pa_user  FOREIGN KEY (created_by)          REFERENCES profiles(id),
  INDEX idx_pa_filter (fiscal_year, quarter_no, main_department, activity_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE past_co_organizers (
  past_id         BIGINT UNSIGNED NOT NULL,
  department_code VARCHAR(20) NOT NULL,
  PRIMARY KEY (past_id, department_code),
  CONSTRAINT fk_paco_act  FOREIGN KEY (past_id)         REFERENCES past_activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_paco_dept FOREIGN KEY (department_code) REFERENCES departments(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE past_activity_images (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  past_id    BIGINT UNSIGNED NOT NULL,
  file_path  VARCHAR(500) NOT NULL,
  sort_no    TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_img_sort CHECK (sort_no BETWEEN 1 AND 5),
  CONSTRAINT fk_img_act FOREIGN KEY (past_id) REFERENCES past_activities(id) ON DELETE CASCADE,
  UNIQUE KEY uq_past_sort (past_id, sort_no)       -- จำกัดสูงสุด 5 ภาพต่อกิจกรรม
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 5) Function / Trigger ตรวจกฎที่ CHECK ทำไม่ได้ ----------

DELIMITER $$

-- วันเริ่ม/สิ้นสุดของไตรมาสในปีงบประมาณ (ต.ค. ของปีก่อนหน้า = ไตรมาส 1)
CREATE FUNCTION fn_quarter_start(fy SMALLINT, q TINYINT) RETURNS DATE DETERMINISTIC
BEGIN
  RETURN CASE q
    WHEN 1 THEN STR_TO_DATE(CONCAT(fy-544,'-10-01'),'%Y-%m-%d')
    WHEN 2 THEN STR_TO_DATE(CONCAT(fy-543,'-01-01'),'%Y-%m-%d')
    WHEN 3 THEN STR_TO_DATE(CONCAT(fy-543,'-04-01'),'%Y-%m-%d')
    ELSE        STR_TO_DATE(CONCAT(fy-543,'-07-01'),'%Y-%m-%d')
  END;
END$$

CREATE FUNCTION fn_quarter_end(fy SMALLINT, q TINYINT) RETURNS DATE DETERMINISTIC
BEGIN
  RETURN CASE q
    WHEN 1 THEN STR_TO_DATE(CONCAT(fy-544,'-12-31'),'%Y-%m-%d')
    WHEN 2 THEN STR_TO_DATE(CONCAT(fy-543,'-03-31'),'%Y-%m-%d')
    WHEN 3 THEN STR_TO_DATE(CONCAT(fy-543,'-06-30'),'%Y-%m-%d')
    ELSE        STR_TO_DATE(CONCAT(fy-543,'-09-30'),'%Y-%m-%d')
  END;
END$$

-- กิจกรรมที่เกิดขึ้นแล้ว: วันที่ต้องอยู่ในไตรมาส และวันเริ่มไม่เกินวันนี้
CREATE TRIGGER trg_past_bi BEFORE INSERT ON past_activities FOR EACH ROW
BEGIN
  IF NEW.start_date < fn_quarter_start(NEW.fiscal_year, NEW.quarter_no)
     OR NEW.end_date > fn_quarter_end(NEW.fiscal_year, NEW.quarter_no) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'วันที่ต้องอยู่ในไตรมาสและปีงบประมาณที่เลือก';
  END IF;
  IF NEW.start_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'กิจกรรมที่เกิดขึ้นแล้วต้องมีวันที่เริ่มไม่เกินวันนี้';
  END IF;
END$$

CREATE TRIGGER trg_past_bu BEFORE UPDATE ON past_activities FOR EACH ROW
BEGIN
  IF NEW.start_date < fn_quarter_start(NEW.fiscal_year, NEW.quarter_no)
     OR NEW.end_date > fn_quarter_end(NEW.fiscal_year, NEW.quarter_no) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'วันที่ต้องอยู่ในไตรมาสและปีงบประมาณที่เลือก';
  END IF;
  IF NEW.start_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'กิจกรรมที่เกิดขึ้นแล้วต้องมีวันที่เริ่มไม่เกินวันนี้';
  END IF;
END$$

-- กิจกรรมที่จะเกิดขึ้น (หมายเหตุ: Excel เขียน "ไม่เกินวันนี้" น่าจะผิด ใช้ "ไม่ก่อนวันนี้" ตอนสร้างรายการ)
CREATE TRIGGER trg_planned_bi BEFORE INSERT ON planned_activities FOR EACH ROW
BEGIN
  IF NEW.expected_start < fn_quarter_start(NEW.fiscal_year, NEW.quarter_no)
     OR NEW.expected_end > fn_quarter_end(NEW.fiscal_year, NEW.quarter_no) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'วันที่ต้องอยู่ในไตรมาสและปีงบประมาณที่เลือก';
  END IF;
  IF NEW.expected_start < CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'กิจกรรมที่จะเกิดขึ้นต้องมีวันที่เริ่มไม่ก่อนวันนี้';
  END IF;
END$$

CREATE TRIGGER trg_planned_bu BEFORE UPDATE ON planned_activities FOR EACH ROW
BEGIN
  IF NEW.expected_start < fn_quarter_start(NEW.fiscal_year, NEW.quarter_no)
     OR NEW.expected_end > fn_quarter_end(NEW.fiscal_year, NEW.quarter_no) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'วันที่ต้องอยู่ในไตรมาสและปีงบประมาณที่เลือก';
  END IF;
END$$

-- ห้ามหน่วยร่วมจัดซ้ำกับหน่วยหลัก
CREATE TRIGGER trg_paco_bi BEFORE INSERT ON past_co_organizers FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM past_activities WHERE id = NEW.past_id AND main_department = NEW.department_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'หน่วยงานร่วมจัดต้องไม่ซ้ำกับหน่วยงานหลัก';
  END IF;
END$$

CREATE TRIGGER trg_plco_bi BEFORE INSERT ON planned_co_organizers FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM planned_activities WHERE id = NEW.planned_id AND main_department = NEW.department_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'หน่วยงานร่วมจัดต้องไม่ซ้ำกับหน่วยงานหลัก';
  END IF;
END$$

DELIMITER ;

-- ---------- 6) ข้อมูลตั้งต้น (Seed) จาก Excel ----------

INSERT INTO departments (code, name_th, sort_no) VALUES
 ('PSUBIC','ศูนย์บ่มเพาะวิสาหกิจ',1),
 ('IPOP','ศูนย์ทรัพย์สินทางปัญญา',2),
 ('IDC','ศูนย์นวัตกรรมการออกแบบ',3),
 ('OIL','สำนักงานความร่วมมืออุตสาหกรรม',4),
 ('P-SEDA','สถานพัฒนาการเป็นผู้ประกอบการนักศึกษา',5),
 ('STI','ฝ่ายโครงสร้างพื้นฐานด้านวิทยาศาสตร์ เทคโนโลยีและนวัตกรรม',6),
 ('STP','ฝ่ายยุทธศาสตร์และแผน',7),
 ('CO','สำนักงานกลาง',8);

INSERT INTO activity_types (id, name_th, description, example) VALUES
 (1,'อบรม/สัมมนา/เวทีเผยแพร่ความรู้','จัดให้ผู้ประกอบการ นักวิจัย นักศึกษา และบุคคลทั่วไป เพื่อสร้างความรู้และทักษะ','AI for Smart Farm, Patent Drafting Workshop, AI & Power BI'),
 (2,'กิจกรรมภารกิจหลัก (บริการและส่งเสริม)','งานที่ทำตามภารกิจของแต่ละฝ่าย ได้แก่ บ่มเพาะ ทรัพย์สินทางปัญญา ออกแบบ ห้องปฏิบัติการ ที่ปรึกษา การประกวดแข่งขัน และการจับคู่ธุรกิจ','TED Youth Startup 2027 (POC), นิลมังกร, PSU Innovation BRIDGE'),
 (3,'สร้างและพัฒนาเครือข่าย','การทำงานร่วมกับพันธมิตร เช่น MOU การลงพื้นที่ร่วมกัน และการประชุมติดตามความร่วมมือ','ลงพื้นที่พบผู้ประกอบการบ้านธรรมร่วมกับ อุทยานวิทยาศาสตร์ ม.ทักษิณ, ABIS 2026'),
 (4,'ต้อนรับเยี่ยมชมศึกษาดูงาน','หน่วยงานหรือกลุ่มภายนอกมาเยี่ยมชม แบ่งย่อยเป็นภาครัฐ เอกชน นักเรียนนักศึกษา และต่างประเทศ','ต้อนรับคณะจาก มรภ.สงขลา'),
 (5,'พัฒนาบุคลากรภายใน','กิจกรรมเพื่อบุคลากร อพวช. เท่านั้น เช่น อบรมภายใน ไปดูงานหน่วยงานอื่น และแลกเปลี่ยนเรียนรู้',NULL),
 (6,'อื่นๆ','กิจกรรมนอกเหนือจาก 5 ประเภทข้างต้น','กิจกรรมประเพณี ศาสนา พิธีการ หรือทำเพื่อชุมชนโดยตรง');

INSERT INTO participant_types (id, name_th) VALUES
 (1,'ผู้ประกอบการ'),(2,'นักวิจัย'),(3,'นักเรียน/นักศึกษา'),(4,'บุคคลทั่วไป'),(5,'บุคลากรภายใน');

INSERT INTO quarters (no, label_th, start_month, end_month) VALUES
 (1,'ไตรมาส 1 (ต.ค.–ธ.ค.)',10,12),
 (2,'ไตรมาส 2 (ม.ค.–มี.ค.)',1,3),
 (3,'ไตรมาส 3 (เม.ย.–มิ.ย.)',4,6),
 (4,'ไตรมาส 4 (ก.ค.–ก.ย.)',7,9);
