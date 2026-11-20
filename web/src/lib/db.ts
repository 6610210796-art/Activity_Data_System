import "server-only";

import mysql, { type Pool } from "mysql2/promise";

declare global {
  var activityDbPool: Pool | undefined;
}

function createPool(): Pool {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT);

  if (!host || !user || !database || !Number.isInteger(port) || port < 1) {
    throw new Error(
      "Database configuration is incomplete. Check DB_HOST, DB_PORT, DB_USER, and DB_NAME in web/.env.local.",
    );
  }

  return mysql.createPool({
    host,
    port,
    user,
    password: process.env.DB_PASSWORD ?? "",
    database,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

export function getDb(): Pool {
  if (!globalThis.activityDbPool) {
    globalThis.activityDbPool = createPool();
  }
  return globalThis.activityDbPool;
}
