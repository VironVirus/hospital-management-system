import { randomUUID } from "node:crypto";
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { hashPassword } from "@/lib/security";
import { HOSPITAL_ID, schemaStatements } from "@/lib/db/schema";

declare global {
  var __stGiannaMySqlPool: Pool | undefined;
  var __stGiannaMigration: Promise<void> | undefined;
}

function databaseOptions() {
  const uri = process.env.DATABASE_URL;
  if (uri) return uri;
  const host = process.env.DB_HOST || process.env.DATABASE_HOST;
  const database = process.env.DB_NAME || process.env.DATABASE_NAME;
  const user = process.env.DB_USER || process.env.DATABASE_USERNAME;
  const password = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD;
  if (!host || !database || !user) return null;
  return {
    host,
    database,
    user,
    password: password || "",
    port: Number(process.env.DB_PORT || process.env.DATABASE_PORT || 3306),
    charset: "utf8mb4",
    timezone: "Z",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 8),
    queueLimit: 0,
    enableKeepAlive: true
  };
}

export function isDatabaseConfigured() {
  return Boolean(databaseOptions());
}

export function getPool() {
  const options = databaseOptions();
  if (!options) throw new Error("MySQL is not configured. Add the DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD environment variables.");
  if (!global.__stGiannaMySqlPool) {
    global.__stGiannaMySqlPool = typeof options === "string"
      ? mysql.createPool(options)
      : mysql.createPool(options);
  }
  return global.__stGiannaMySqlPool;
}

export async function migrateDatabase() {
  if (!isDatabaseConfigured()) return;
  if (!global.__stGiannaMigration) {
    global.__stGiannaMigration = (async () => {
      const pool = getPool();
      for (const statement of schemaStatements) await pool.query(statement);
      await pool.execute("DELETE FROM user_sessions WHERE expires_at <= UTC_TIMESTAMP(3)");
      await pool.execute(
        `INSERT INTO facilities (id, name, code, address, is_active)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE name = VALUES(name), code = VALUES(code), address = VALUES(address), is_active = 1`,
        [HOSPITAL_ID, "St Gianna Specialist Hospital", "ST-GIANNA", "No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State"]
      );
      await pool.execute(
        `INSERT INTO lab_branding_settings (facility_id, lab_name, address, report_footer)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE lab_name = VALUES(lab_name), address = VALUES(address)`,
        [HOSPITAL_ID, "St Gianna Specialist Hospital", "No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State", "Coordinated care under one permanent Hospital ID."]
      );
      const adminEmail = process.env.HMS_ADMIN_EMAIL?.trim().toLowerCase();
      const adminPassword = process.env.HMS_ADMIN_PASSWORD;
      if (adminEmail && adminPassword) {
        const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM profiles WHERE role = 'Admin' LIMIT 1");
        if (!existing.length) {
          await pool.execute(
            `INSERT INTO profiles (id, facility_id, display_name, email, password_hash, role, approval_status, is_active)
             VALUES (?, ?, ?, ?, ?, 'Admin', 'Approved', 1)`,
            [randomUUID(), HOSPITAL_ID, process.env.HMS_ADMIN_NAME?.trim() || "Hospital Administrator", adminEmail, await hashPassword(adminPassword)]
          );
        }
      }
      await pool.execute("INSERT IGNORE INTO schema_migrations (id) VALUES (1)");
    })().catch((error) => {
      global.__stGiannaMigration = undefined;
      throw error;
    });
  }
  await global.__stGiannaMigration;
}

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>) {
  await migrateDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function nextCounter(key: string, connection?: PoolConnection) {
  const reserve = async (executor: PoolConnection) => {
    await executor.execute(
      "INSERT IGNORE INTO counters (counter_key, counter_value) VALUES (?, 999)",
      [key]
    );
    await executor.execute(
      "UPDATE counters SET counter_value = counter_value + 1 WHERE counter_key = ?",
      [key]
    );
    const [rows] = await executor.query<RowDataPacket[]>(
      "SELECT counter_value FROM counters WHERE counter_key = ? FOR UPDATE",
      [key]
    );
    return Number(rows[0]?.counter_value || 1000);
  };

  if (connection) return reserve(connection);
  return withTransaction(reserve);
}
