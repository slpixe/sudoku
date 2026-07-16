import {describe, expect, it} from "vitest";
import {loadServerConfig} from "./config.js";

describe("loadServerConfig", () => {
  it("applies local defaults and parses comma-separated origins", () => {
    expect(
      loadServerConfig({
        NODE_ENV: "development",
        ALLOWED_ORIGINS: "https://sudoku.slpixe.com, http://localhost:3000, ",
      }),
    ).toEqual({
      nodeEnv: "development",
      databaseUrl: undefined,
      port: 8080,
      roomTtlHours: 24,
      reconnectGraceSeconds: 60,
      allowedOrigins: ["https://sudoku.slpixe.com", "http://localhost:3000"],
    });
  });

  it("requires a Postgres database URL in production", () => {
    expect(() => loadServerConfig({NODE_ENV: "production"})).toThrow(/DATABASE_URL/);
    expect(() =>
      loadServerConfig({NODE_ENV: "production", DATABASE_URL: "https://database.example.com"}),
    ).toThrow(/DATABASE_URL/);
  });

  it.each(["postgres:local", "postgresql:db", "postgres:///sudoku", "postgresql:/sudoku"])(
    "rejects PostgreSQL URLs without a hostname: %s",
    (databaseUrl) => {
      expect(() => loadServerConfig({DATABASE_URL: databaseUrl})).toThrow(/DATABASE_URL/);
    },
  );

  it.each(["postgres://database.example.com/sudoku", "postgresql://database.example.com/sudoku"])(
    "accepts a hierarchical PostgreSQL URL: %s",
    (databaseUrl) => {
      expect(loadServerConfig({NODE_ENV: "production", DATABASE_URL: databaseUrl}).databaseUrl).toBe(databaseUrl);
    },
  );

  it("rejects invalid numeric values and malformed origins", () => {
    expect(() => loadServerConfig({PORT: "0"})).toThrow(/PORT/);
    expect(() => loadServerConfig({ROOM_TTL_HOURS: "NaN"})).toThrow(/ROOM_TTL_HOURS/);
    expect(() => loadServerConfig({RECONNECT_GRACE_SECONDS: "-1"})).toThrow(/RECONNECT_GRACE_SECONDS/);
    expect(() => loadServerConfig({ALLOWED_ORIGINS: "not an origin"})).toThrow(/ALLOWED_ORIGINS/);
  });
});
