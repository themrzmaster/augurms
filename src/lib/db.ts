import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { PATHS } from "./cosmic";

let pool: mysql.Pool | null = null;

function getDbConfig() {
  const configContent = readFileSync(PATHS.config, "utf-8");
  const config = parseYaml(configContent);
  const server = config.server;
  return {
    host: process.env.DB_HOST || server.DB_HOST || "localhost",
    port: 3307,
    user: server.DB_USER || "root",
    password: server.DB_PASS || "",
    database: "cosmic",
  };
}

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...getDbConfig(),
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows as T[];
}

export async function execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  const p = getPool();
  const [result] = await p.execute(sql, params);
  return result as mysql.ResultSetHeader;
}
