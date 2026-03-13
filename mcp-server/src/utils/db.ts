import mysql from "mysql2/promise";
import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { PATHS } from "./paths.js";

let pool: mysql.Pool | null = null;

async function getDbConfig() {
  const configContent = await readFile(PATHS.config, "utf-8");
  const config = parseYaml(configContent);
  const server = config.server;

  const jdbcUrl: string = server.DB_URL_FORMAT || "jdbc:mysql://%s:3306/cosmic";
  const host = process.env.DB_HOST || server.DB_HOST || "localhost";
  const portMatch = jdbcUrl.match(/:(\d+)\//);
  const port = portMatch ? parseInt(portMatch[1]) : 3306;
  const dbMatch = jdbcUrl.match(/\/([^?]+)/);
  const database = dbMatch ? dbMatch[1] : "cosmic";

  return {
    host,
    port: host === "localhost" ? 3307 : port, // Docker exposes on 3307
    user: server.DB_USER || "root",
    password: server.DB_PASS || "",
    database,
  };
}

export async function getPool(): Promise<mysql.Pool> {
  if (!pool) {
    const config = await getDbConfig();
    pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const p = await getPool();
  const [rows] = await p.execute(sql, params);
  return rows as T[];
}

export async function execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  const p = await getPool();
  const [result] = await p.execute(sql, params);
  return result as mysql.ResultSetHeader;
}
