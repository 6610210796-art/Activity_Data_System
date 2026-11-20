import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env.local"),
});

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Fill it in web/.env.local first.`);
  }
  return value;
}

async function ask(prompt) {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    return (await terminal.question(prompt)).trim();
  } finally {
    terminal.close();
  }
}

function askHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this script in an interactive terminal to enter the password safely.");
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let password = "";
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          reject(new Error("Admin setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(password);
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          password = password.slice(0, -1);
        } else if (character >= " ") {
          password += character;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const email = (await ask("อีเมลแอดมิน: ")).toLowerCase();
  const fullName = await ask("ชื่อแอดมิน: ");
  const password = await askHidden("รหัสผ่าน (ไม่แสดงบนหน้าจอ): ");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("รูปแบบอีเมลไม่ถูกต้อง");
  }
  if (!fullName || fullName.length > 150) {
    throw new Error("กรุณาระบุชื่อไม่เกิน 150 ตัวอักษร");
  }
  if (password.length < 12) {
    throw new Error("รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร");
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
    const [admins] = await pool.execute(
      "SELECT id FROM profiles WHERE role = ? LIMIT 1",
      ["admin"],
    );
    if (admins.length > 0) {
      throw new Error("มีบัญชีผู้ดูแลระบบแล้ว ไม่สามารถสร้างบัญชีแรกซ้ำได้");
    }

    const [existing] = await pool.execute(
      "SELECT id FROM profiles WHERE email = ? LIMIT 1",
      [email],
    );
    if (existing.length > 0) {
      throw new Error("อีเมลนี้มีบัญชีอยู่แล้ว");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute(
      "INSERT INTO profiles (email, password_hash, full_name, role, department_code, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      [email, passwordHash, fullName, "admin", null, 1],
    );
    console.log("สร้างบัญชีผู้ดูแลระบบเรียบร้อยแล้ว");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("สร้างบัญชีผู้ดูแลไม่สำเร็จ", error);
  process.exitCode = 1;
});
