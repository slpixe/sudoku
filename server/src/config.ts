import {z} from "zod";

const postgresUrlSchema = z.string().trim().min(1).refine(
  (value) => {
    try {
      return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  },
  {message: "DATABASE_URL must be a Postgres URL"},
);

const originSchema = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
    } catch {
      return false;
    }
  },
  {message: "ALLOWED_ORIGINS entries must be HTTP(S) origins"},
);

const positiveInteger = (name: string) =>
  z.coerce.number().int(`${name} must be an integer`).positive(`${name} must be positive`);

const nonNegativeInteger = (name: string) =>
  z.coerce.number().int(`${name} must be an integer`).nonnegative(`${name} must not be negative`);

const rawServerConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: postgresUrlSchema.optional(),
    PORT: positiveInteger("PORT").max(65_535, "PORT must not exceed 65535").default(8080),
    ROOM_TTL_HOURS: positiveInteger("ROOM_TTL_HOURS").default(24),
    RECONNECT_GRACE_SECONDS: nonNegativeInteger("RECONNECT_GRACE_SECONDS").default(60),
    ALLOWED_ORIGINS: z
      .string()
      .default("")
      .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
      .pipe(z.array(originSchema)),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === "production" && config.DATABASE_URL === undefined) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required in production",
      });
    }
  });

export interface ServerConfig {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string | undefined;
  port: number;
  roomTtlHours: number;
  reconnectGraceSeconds: number;
  allowedOrigins: string[];
}

type Environment = Readonly<Record<string, string | undefined>>;

export function loadServerConfig(environment: Environment = process.env): ServerConfig {
  const parsed = rawServerConfigSchema.parse({
    NODE_ENV: environment.NODE_ENV,
    DATABASE_URL: environment.DATABASE_URL,
    PORT: environment.PORT,
    ROOM_TTL_HOURS: environment.ROOM_TTL_HOURS,
    RECONNECT_GRACE_SECONDS: environment.RECONNECT_GRACE_SECONDS,
    ALLOWED_ORIGINS: environment.ALLOWED_ORIGINS,
  });

  return {
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.PORT,
    roomTtlHours: parsed.ROOM_TTL_HOURS,
    reconnectGraceSeconds: parsed.RECONNECT_GRACE_SECONDS,
    allowedOrigins: parsed.ALLOWED_ORIGINS,
  };
}
