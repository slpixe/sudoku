import {Pool, type PoolConfig, type PoolClient, type QueryResult as PgQueryResult} from "pg";

import type {Database, QueryExecutor, QueryResult} from "./Database.js";

interface PoolLike {
  query<Row extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<PgQueryResult<Row>>;
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

function normalizeResult<Row>(result: PgQueryResult<Record<string, unknown>>): QueryResult<Row> {
  return {
    rows: result.rows as Row[],
    rowCount: result.rowCount ?? result.rows.length,
  };
}

function queryExecutor(client: PoolClient): QueryExecutor {
  return {
    async query<Row>(text: string, values: readonly unknown[] = []): Promise<QueryResult<Row>> {
      return normalizeResult<Row>(await client.query(text, values.length === 0 ? undefined : [...values]));
    },
  };
}

export class PgDatabase implements Database {
  readonly #pool: PoolLike;

  constructor(connection: string | PoolConfig | PoolLike) {
    this.#pool = typeof connection === "string" || !("connect" in connection) ? new Pool(
      typeof connection === "string" ? {connectionString: connection} : connection,
    ) : connection;
  }

  async query<Row>(text: string, values: readonly unknown[] = []): Promise<QueryResult<Row>> {
    return normalizeResult<Row>(await this.#pool.query(text, values.length === 0 ? undefined : [...values]));
  }

  async transaction<T>(work: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(queryExecutor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
