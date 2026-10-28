#!/usr/bin/env node
/**
 * Environment Validation Script for Pre-Flight / Pre-Deployment Checks.
 * Evaluates configured environment variables against production criteria.
 * Guarantees zero secret leakage in logs or terminal output.
 */

const isProduction = process.env.NODE_ENV === "production";
const errors = [];
const warnings = [];

console.log("==================================================================");
console.log("🔍 PRE-FLIGHT ENVIRONMENT & SECURITY VALIDATION");
console.log("==================================================================");
console.log(`Node Environment:  ${process.env.NODE_ENV || "development (default)"}`);
console.log(`Configured Port:   ${process.env.PORT || "3000 (default)"}`);
console.log(`Configured Host:   ${process.env.HOSTNAME || "0.0.0.0 (default)"}`);
console.log(`Database URL:      ${process.env.DATABASE_URL ? "[CONFIGURED]" : "file:./dev.db (local default)"}`);

// 1. JWT Secret Validation
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    errors.push("JWT_SECRET is missing. A cryptographically secure secret (>= 32 chars) is required in production.");
  } else {
    warnings.push("JWT_SECRET is unset. Default development placeholder will be used.");
  }
} else if (jwtSecret === "default_super_secret_key_change_me_in_production") {
  if (isProduction) {
    errors.push("JWT_SECRET is using the insecure default placeholder in production mode!");
  } else {
    warnings.push("JWT_SECRET is using the development default placeholder.");
  }
} else if (jwtSecret.length < 16) {
  if (isProduction) {
    errors.push("JWT_SECRET length is less than 16 characters. High-entropy key required in production.");
  } else {
    warnings.push("JWT_SECRET is short (< 16 characters). Recommend >= 32 characters.");
  }
}

// 2. Base URL Validation
const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!appUrl) {
  warnings.push("APP_URL / NEXT_PUBLIC_APP_URL is not set. Defaulting to http://localhost:3000.");
} else if (isProduction && !appUrl.startsWith("https://")) {
  warnings.push(`APP_URL does not use HTTPS protocol (${appUrl}). Secure transport is strongly recommended for production.`);
}

// 3. Billing & Payments Configuration
const hasSaasBilling = Boolean(process.env.SAAS_BILLING_RAZORPAY_KEY_ID && process.env.SAAS_BILLING_RAZORPAY_KEY_SECRET);
const hasPaymentGateway = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

console.log(`SaaS Subscriptions: ${hasSaasBilling ? "Configured" : "Dev Mock / Sandbox Fallback"}`);
console.log(`Customer Payments:  ${hasPaymentGateway ? "Configured" : "Dev Mock / Sandbox Fallback"}`);

// Summary
console.log("\n------------------------------------------------------------------");
if (warnings.length > 0) {
  console.log(`⚠️  WARNINGS (${warnings.length}):`);
  warnings.forEach((w) => console.log(`   - ${w}`));
}

if (errors.length > 0) {
  console.error(`\n❌ CRITICAL ERRORS (${errors.length}):`);
  errors.forEach((e) => console.error(`   - ${e}`));
  console.error("\nEnvironment validation FAILED. Correct the variables above before deploying.");
  process.exit(1);
}

console.log("✅ Environment configuration passed pre-flight validation.");
console.log("==================================================================\n");
process.exit(0);
