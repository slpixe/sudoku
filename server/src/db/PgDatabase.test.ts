import {describe, expect, it, vi} from "vitest";

import {PgDatabase} from "./PgDatabase.js";

function result(rows: Record<string, unknown>[] = []) {
  return {rows, rowCount: rows.length, command: "", oid: 0, fields: []};
}

function fakePool() {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => result());
  const release = vi.fn();
  const client = {query, release};
  const pool = {
    query: vi.fn(async (_text: string, _values?: readonly unknown[]) => result()),
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
  };
  return {client, pool, query, release};
}

describe("PgDatabase", () => {
  it("runs a transaction on one checked-out client and releases it after commit", async () => {
    const {pool, query, release} = fakePool();
    const database = new PgDatabase(pool as never);

    await expect(database.transaction(async (tx) => {
      await tx.query("UPDATE rooms SET revision = $1", [1]);
      return "committed";
    })).resolves.toBe("committed");

    expect(pool.connect).toHaveBeenCalledOnce();
    expect(pool.query).not.toHaveBeenCalled();
    expect(query.mock.calls.map(([text]) => text)).toEqual([
      "BEGIN",
      "UPDATE rooms SET revision = $1",
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back on failure and always releases the checked-out client", async () => {
    const {pool, query, release} = fakePool();
    const database = new PgDatabase(pool as never);

    await expect(database.transaction(async (tx) => {
      await tx.query("DELETE FROM rooms");
      throw new Error("write failed");
    })).rejects.toThrow("write failed");

    expect(query.mock.calls.map(([text]) => text)).toEqual(["BEGIN", "DELETE FROM rooms", "ROLLBACK"]);
    expect(release).toHaveBeenCalledOnce();
  });
});
