import { z } from "zod";

/**
 * Production Environment Configuration Schema.
 * Validates critical environment variables at startup.
 * Enforces strict security standards in production while permitting flexible local defaults.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOSTNAME: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  APP_URL: z.string().url().or(z.string().min(1)).default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url().or(z.string().min(1)).default("http://localhost:3000"),
  BUILD_STANDALONE: z.enum(["true", "false"]).optional(),

  // Authentication & Security
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),

  // Platform Billing (Razorpay)
  SAAS_BILLING_RAZORPAY_KEY_ID: z.string().optional(),
  SAAS_BILLING_RAZORPAY_KEY_SECRET: z.string().optional(),
  SAAS_BILLING_WEBHOOK_SECRET: z.string().optional(),

  // Restaurant Payments (Razorpay)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Observability
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Validates environment variables.
 * Formats errors strictly listing variable names and validation reasons WITHOUT printing secrets.
 */
export function validateEnv(): { valid: boolean; errors: string[]; env: Env } {
  const isProduction = process.env.NODE_ENV === "production";

  // Provide fallback in dev/test if JWT_SECRET was unset
  const rawEnv = {
    ...process.env,
    JWT_SECRET:
      process.env.JWT_SECRET ||
      (!isProduction ? "default_super_secret_key_change_me_in_production" : ""),
  };

  const result = envSchema.safeParse(rawEnv);

  const errors: string[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.join(".");
      errors.push(`${field}: ${issue.message}`);
    }
  }

  // Extra security checks in production
  if (isProduction && result.success) {
    if (result.data.JWT_SECRET === "default_super_secret_key_change_me_in_production") {
      errors.push("JWT_SECRET must not use the insecure default placeholder in production mode");
    }
    if (result.data.JWT_SECRET.length < 16) {
      errors.push("JWT_SECRET must be at least 16 characters in production mode");
    }
  }

  if (!result.success || errors.length > 0) {
    return {
      valid: false,
      errors,
      env: (result.success ? result.data : rawEnv) as Env,
    };
  }

  cachedEnv = result.data;
  return { valid: true, errors: [], env: result.data };
}

/**
 * Returns typed validated environment variables.
 */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const { env } = validateEnv();
  cachedEnv = env;
  return cachedEnv;
}
