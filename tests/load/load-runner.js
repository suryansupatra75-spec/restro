/**
 * RESTAURANT SaaS — Multi-Virtual-User Load Runner
 *
 * Measures:
 * - Throughput (req/sec)
 * - Latency distributions (Min, Mean, p50, p90, p95, p99, Max)
 * - Error rate & breakdown (2xx, 4xx, 5xx, Network)
 * - SQLite concurrency contention & SQLITE_BUSY detection
 * - Automatic safety abort if error rate > 5%
 */

const fs = require("fs");
const path = require("path");
const { setupTestTenant, cleanupTestTenant, prisma } = require("./fixtures");
const {
  pickWeightedScenario,
  executeTimedRequest,
} = require("./scenarios");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function calculatePercentiles(durations) {
  if (durations.length === 0) {
    return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const getP = (p) => {
    const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return Number(sorted[idx].toFixed(2));
  };
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: Number(sorted[0].toFixed(2)),
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    mean: Number((sum / sorted.length).toFixed(2)),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Runs a load testing stage
 */
async function runStage({ stageName, vus, durationSeconds, context, isSmoke = false }) {
  console.log("\n" + "=".repeat(70));
  console.log(`🚀 STARTING ${stageName.toUpperCase()}`);
  console.log(`   Virtual Users (VUs): ${vus} | Duration: ${durationSeconds}s | Base URL: ${context.baseUrl}`);
  console.log("=".repeat(70));

  const startTime = Date.now();
  const endTime = startTime + durationSeconds * 1000;

  const results = [];
  const actionStats = {};
  let totalErrors = 0;
  let sqliteBusyCount = 0;
  let aborted = false;
  let abortReason = "";

  // Worker loop for a single virtual user
  async function runWorker(vuIndex) {
    while (Date.now() < endTime && !aborted) {
      let scenarioResult;

      if (isSmoke) {
        // Smoke test tests baseline routes systematically
        const smokeRoutes = [
          { url: `${context.baseUrl}/api/health`, action: "GET /api/health" },
          { url: `${context.baseUrl}/api/ready`, action: "GET /api/ready" },
          { url: `${context.baseUrl}/q/${context.qrToken}`, action: "GET /q/[token]" },
        ];
        const target = smokeRoutes[results.length % smokeRoutes.length];
        const res = await executeTimedRequest(target.url);
        scenarioResult = {
          scenario: "BASELINE_SMOKE",
          action: target.action,
          ...res,
        };
      } else {
        // Realistic weighted scenario
        const scenarioFn = pickWeightedScenario();
        scenarioResult = await scenarioFn(context);
      }

      results.push(scenarioResult);

      // Track by action
      const act = scenarioResult.action;
      if (!actionStats[act]) {
        actionStats[act] = {
          action: act,
          total: 0,
          success: 0,
          c4xx: 0,
          c5xx: 0,
          durations: [],
        };
      }
      actionStats[act].total++;
      if (scenarioResult.success) {
        actionStats[act].success++;
      } else if (scenarioResult.status >= 400 && scenarioResult.status < 500) {
        actionStats[act].c4xx++;
        totalErrors++;
      } else {
        actionStats[act].c5xx++;
        totalErrors++;
      }
      actionStats[act].durations.push(scenarioResult.durationMs);

      if (scenarioResult.isBusy) {
        sqliteBusyCount++;
        console.warn(`\n⚠️  [VU-${vuIndex}] SQLITE_BUSY detected on ${act}!`);
      }

      // Safety check: Abort if error rate > 5% after minimum 25 requests
      if (results.length >= 25) {
        const errorRate = (totalErrors / results.length) * 100;
        if (errorRate > 5) {
          aborted = true;
          abortReason = `Error rate exceeded 5% threshold (${errorRate.toFixed(1)}% on ${results.length} requests)`;
          console.error(`\n🛑 SAFETY AUTO-ABORT TRIGGERED: ${abortReason}`);
          break;
        }
      }

      // Human think time pacing (100ms - 250ms)
      const thinkTime = isSmoke ? 150 : Math.floor(100 + Math.random() * 150);
      await sleep(thinkTime);
    }
  }

  // Launch all VUs concurrently
  const workers = Array.from({ length: vus }, (_, i) => runWorker(i + 1));
  await Promise.all(workers);

  const actualDurationSec = (Date.now() - startTime) / 1000;
  const totalRequests = results.length;
  const throughput = totalRequests / actualDurationSec;
  const allDurations = results.map((r) => r.durationMs);
  const overallLatency = calculatePercentiles(allDurations);
  const overallSuccess = results.filter((r) => r.success).length;
  const overallSuccessRate = totalRequests > 0 ? (overallSuccess / totalRequests) * 100 : 0;

  // Print Summary Table
  console.log("\n" + "-".repeat(70));
  console.log(`📊 ${stageName.toUpperCase()} — RESULTS SUMMARY`);
  console.log("-".repeat(70));
  console.log(`  Total Requests:     ${totalRequests}`);
  console.log(`  Duration:           ${actualDurationSec.toFixed(2)}s`);
  console.log(`  Throughput:         ${throughput.toFixed(2)} req/sec`);
  console.log(`  Success Rate:       ${overallSuccessRate.toFixed(2)}% (${overallSuccess}/${totalRequests})`);
  console.log(`  Total Errors:       ${totalErrors} (4xx: ${results.filter((r) => r.status >= 400 && r.status < 500).length}, 5xx: ${results.filter((r) => r.status >= 500 || r.status === 0).length})`);
  console.log(`  SQLITE_BUSY Contention: ${sqliteBusyCount} occurrences`);
  if (aborted) {
    console.log(`  ⚠️  ABORTED EARLY:    ${abortReason}`);
  }
  console.log("\n📈 LATENCY DISTRIBUTION (ms):");
  console.log(`  Min:  ${overallLatency.min} ms`);
  console.log(`  p50:  ${overallLatency.p50} ms`);
  console.log(`  p90:  ${overallLatency.p90} ms`);
  console.log(`  p95:  ${overallLatency.p95} ms`);
  console.log(`  p99:  ${overallLatency.p99} ms`);
  console.log(`  Max:  ${overallLatency.max} ms`);
  console.log(`  Mean: ${overallLatency.mean} ms`);

  console.log("\n🔍 PER-ROUTE BREAKDOWN:");
  console.log(
    "  " +
      "Action".padEnd(28) +
      "Count".padStart(7) +
      "Success%".padStart(10) +
      "p50(ms)".padStart(9) +
      "p95(ms)".padStart(9) +
      "p99(ms)".padStart(9)
  );
  console.log("  " + "-".repeat(72));

  const routeBreakdown = {};
  for (const [actionName, stats] of Object.entries(actionStats)) {
    const lat = calculatePercentiles(stats.durations);
    const rate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
    routeBreakdown[actionName] = {
      total: stats.total,
      successRate: Number(rate.toFixed(1)),
      latency: lat,
    };
    console.log(
      "  " +
        actionName.padEnd(28) +
        String(stats.total).padStart(7) +
        `${rate.toFixed(1)}%`.padStart(10) +
        String(lat.p50).padStart(9) +
        String(lat.p95).padStart(9) +
        String(lat.p99).padStart(9)
    );
  }

  return {
    stageName,
    vus,
    durationSeconds: Number(actualDurationSec.toFixed(2)),
    totalRequests,
    throughput: Number(throughput.toFixed(2)),
    successRate: Number(overallSuccessRate.toFixed(2)),
    totalErrors,
    sqliteBusyCount,
    aborted,
    abortReason,
    overallLatency,
    routeBreakdown,
  };
}

/**
 * Main Runner
 */
async function main() {
  const args = process.argv.slice(2);
  const hasFlag = (f) => args.includes(f);
  const getArg = (prefix) => {
    const item = args.find((a) => a.startsWith(prefix));
    return item ? item.split("=")[1] : null;
  };

  const targetStage = getArg("--stage");
  const runAll = hasFlag("--all") || !targetStage;

  console.log("==================================================================");
  console.log("🍽️  RESTAURANT SAAS — LOAD TESTING HARNESS");
  console.log("==================================================================");

  // 1. Setup Test Tenant
  console.log("\n🔧 Provisioning synthetic tenant for load test...");
  const context = await setupTestTenant(BASE_URL);
  context.orderPool = [];
  console.log(`✅ Provisioned:`);
  console.log(`   Restaurant:  ${context.restaurant.name} (${context.restaurant.id})`);
  console.log(`   Table:       ${context.table.name}`);
  console.log(`   QR Token:    ${context.qrToken}`);
  console.log(`   Menu Items:  ${context.items.length} items`);

  // Pre-seed an initial order so order tracking scenario has immediate targets
  try {
    const preseedRes = await fetch(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: context.qrToken,
        paymentMethod: "CASH",
        idempotencyKey: `preseed_${Date.now()}`,
        items: [{ menuItemId: context.items[0].id, quantity: 1 }],
        customerName: "Seeded Guest",
      }),
    });
    if (preseedRes.ok) {
      const pJson = await preseedRes.json();
      if (pJson.order?.id) {
        context.orderPool.push(pJson.order.id);
        console.log(`   Initial Seed Order: ${pJson.order.orderNumber} (${pJson.order.id})`);
      }
    }
  } catch (err) {
    console.warn("   Preseed order notice:", err.message);
  }

  // WARMUP PHASE: Ensure Next.js dev server JIT compilation is complete for all routes
  console.log("\n🔥 Warming up routes (triggering Next.js JIT compilation)...");
  try {
    const warmupEndpoints = [
      { url: `${BASE_URL}/api/health`, method: "GET" },
      { url: `${BASE_URL}/api/ready`, method: "GET" },
      { url: `${BASE_URL}/q/${context.qrToken}`, method: "GET" },
      {
        url: `${BASE_URL}/api/v1/tables/call-waiter`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: context.qrToken, type: "WAITER" }),
      },
      {
        url: `${BASE_URL}/api/v1/orders/admin?restaurantId=${context.restaurant.id}&status=ACTIVE`,
        method: "GET",
        headers: { Cookie: `session=${context.sessionToken}` },
      },
    ];
    if (context.orderPool.length > 0) {
      warmupEndpoints.push({
        url: `${BASE_URL}/api/v1/orders/track?token=${context.qrToken}&orderId=${context.orderPool[0]}`,
        method: "GET",
      });
    }

    for (const ep of warmupEndpoints) {
      const wStart = performance.now();
      await fetch(ep.url, {
        method: ep.method,
        headers: ep.headers,
        body: ep.body,
      });
      const wDur = (performance.now() - wStart).toFixed(0);
      console.log(`   Compiled ${ep.method} ${ep.url.replace(BASE_URL, "")} (${wDur}ms)`);
    }
    console.log("✅ Warmup complete. Dev server routes precompiled.");
  } catch (err) {
    console.warn("   Warmup notice:", err.message);
  }

  const reports = [];

  try {
    // STAGE 0: Baseline Smoke Test (1 VU, 30s)
    if (runAll || targetStage === "0") {
      const report0 = await runStage({
        stageName: "Stage 0: Baseline Smoke Test",
        vus: 1,
        durationSeconds: 30,
        context,
        isSmoke: true,
      });
      reports.push(report0);
      await sleep(2000);
    }

    // STAGE 1: Light Concurrency (5 VUs, 60s)
    if (runAll || targetStage === "1") {
      const report1 = await runStage({
        stageName: "Stage 1: Light Concurrency",
        vus: 5,
        durationSeconds: 60,
        context,
        isSmoke: false,
      });
      reports.push(report1);
      await sleep(3000);
    }

    // STAGE 2: Realistic Peak Concurrency (10 VUs, 60s)
    if (runAll || targetStage === "2") {
      const report2 = await runStage({
        stageName: "Stage 2: Realistic Peak Concurrency",
        vus: 10,
        durationSeconds: 60,
        context,
        isSmoke: false,
      });
      reports.push(report2);
    }

    // Save report to disk
    const resultsDir = path.join(__dirname, "results");
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    const reportPath = path.join(
      resultsDir,
      `load-test-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2), "utf8");
    console.log(`\n💾 Saved detailed test results to: ${reportPath}`);
  } finally {
    // Teardown: Clean up synthetic tenant data completely
    console.log("\n🧹 Cleaning up synthetic test tenant data...");
    const cleanupSummary = await cleanupTestTenant();
    console.log("✅ Teardown complete. Zero residue left in database:", cleanupSummary);
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL RUNNER ERROR:", err);
    process.exit(1);
  });
}

module.exports = { main, runStage };
