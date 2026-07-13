import {readdir, readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

import type {Database} from "./Database.js";
import {PgDatabase} from "./PgDatabase.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));

export async function runMigrations(database: Database, directory = migrationsDirectory): Promise<void> {
  await database.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL
  )`);

  const migrationNames = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort((first, second) => first.localeCompare(second));

  for (const name of migrationNames) {
    const sql = await readFile(path.join(directory, name), "utf8");
    await database.transaction(async (tx) => {
      const applied = await tx.query<{name: string}>("SELECT name FROM schema_migrations WHERE name = $1", [name]);
      if (applied.rowCount > 0) {
        return;
      }

      for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
        await tx.query(statement);
      }
      await tx.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [name, new Date()]);
    });
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const database = new PgDatabase(connectionString);
  try {
    await runMigrations(database);
  } finally {
    await database.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
