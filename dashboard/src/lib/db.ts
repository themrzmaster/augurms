import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { PATHS } from "./cosmic";

let pool: mysql.Pool | null = null;

function getDbConfig() {
  // In production (Docker), use env vars directly; in dev, fall back to config.yaml
  const host = process.env.DB_HOST;
  const password = process.env.DB_PASS;

  if (host) {
    return {
      host,
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER || "root",
      password: password || "",
      database: process.env.DB_NAME || "cosmic",
    };
  }

  const configContent = readFileSync(PATHS.config, "utf-8");
  const config = parseYaml(configContent);
  const server = config.server;
  return {
    host: server.DB_HOST || "localhost",
    port: 3307,
    user: server.DB_USER || "root",
    password: password || server.DB_PASS || "",
    database: "cosmic",
  };
}

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...getDbConfig(),
      waitForConnections: true,
      connectionLimit: 15,
      // Evict idle conns after 60s so a DB restart doesn't leave the pool
      // holding dead TCP sockets that hang the next request.
      maxIdle: 5,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30_000,
      connectTimeout: 10_000,
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
