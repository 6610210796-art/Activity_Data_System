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
          reject(new Error("Password reset cancelled."));
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
  const email = (await ask("อีเมลบัญชีเว็บที่ต้องการตั้งรหัสผ่านใหม่: "))
    .trim()
    .toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("รูปแบบอีเมลไม่ถูกต้อง");
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
    const [profiles] = await pool.execute(
      "SELECT id FROM profiles WHERE email = ? LIMIT 1",
      [email],
    );
    const profile = profiles[0];
    if (!profile) {
      throw new Error("ไม่พบบัญชีเว็บที่ใช้อีเมลนี้");
    }

    const password = await askHidden("รหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษร): ");
    const confirmation = await askHidden("พิมพ์รหัสผ่านใหม่อีกครั้ง: ");
    if (password.length < 12) {
      throw new Error("รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร");
    }
    if (password !== confirmation) {
      throw new Error("รหัสผ่านทั้งสองครั้งไม่ตรงกัน");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute(
      "UPDATE profiles SET password_hash = ? WHERE id = ?",
      [passwordHash, profile.id],
    );
    console.log("เปลี่ยนรหัสผ่านบัญชีเว็บเรียบร้อยแล้ว");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("เปลี่ยนรหัสผ่านไม่สำเร็จ", error);
  process.exitCode = 1;
});
