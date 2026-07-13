import {PGlite} from "@electric-sql/pglite";

import type {Database, QueryExecutor, QueryResult} from "../db/Database.js";

interface PgliteQueryExecutor {
  query<Row>(text: string, values?: unknown[]): Promise<{rows: Row[]; affectedRows?: number}>;
}

function executor(database: PgliteQueryExecutor): QueryExecutor {
  return {
    async query<Row>(text: string, values: readonly unknown[] = []): Promise<QueryResult<Row>> {
      const result = await database.query<Row>(text, values.length === 0 ? undefined : [...values]);
      return {
        rows: result.rows,
        rowCount: result.rows.length > 0 ? result.rows.length : (result.affectedRows ?? 0),
      };
    },
  };
}

export class PgliteDatabase implements Database {
  readonly #database: PGlite;

  constructor(database: PGlite = new PGlite()) {
    this.#database = database;
  }

  async query<Row>(text: string, values: readonly unknown[] = []): Promise<QueryResult<Row>> {
    return executor(this.#database).query<Row>(text, values);
  }

  async transaction<T>(work: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    return this.#database.transaction(async (tx) => work(executor(tx)));
  }

  async close(): Promise<void> {
    await this.#database.close();
  }
}
