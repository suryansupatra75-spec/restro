/**
 * Load Testing Scenarios
 *
 * Defines the user journeys and request actions:
 * 1. Customer Menu Browsing (75% weight)
 * 2. Waiter Service & Order Placement (15% weight)
 * 3. Kitchen & Staff Order Polling (10% weight)
 */

const crypto = require("crypto");

/**
 * Execute a timed HTTP request with safety checks
 */
async function executeTimedRequest(url, options = {}) {
  const method = options.method || "GET";
  const start = performance.now();
  let status = 0;
  let success = false;
  let isBusy = false;
  let errorMsg = null;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Connection: "keep-alive",
        ...(options.headers || {}),
      },
    });

    status = res.status;
    const end = performance.now();
    const durationMs = end - start;

    const text = await res.text();
    if (text.includes("SQLITE_BUSY") || text.includes("database is locked")) {
      isBusy = true;
      errorMsg = "SQLITE_BUSY detected in response body";
    }

    if (status >= 200 && status < 300) {
      success = true;
    } else {
      success = false;
      if (!errorMsg) {
        try {
          const json = JSON.parse(text);
          errorMsg = json.error || json.message || `HTTP ${status}`;
        } catch {
          errorMsg = `HTTP ${status}: ${text.slice(0, 80)}`;
        }
      }
    }

    return {
      url,
      method,
      status,
      durationMs,
      success,
      isBusy,
      error: errorMsg,
      bodyText: text,
    };
  } catch (err) {
    const end = performance.now();
    const durationMs = end - start;
    const msg = err.message || String(err);
    if (msg.includes("SQLITE_BUSY") || msg.includes("database is locked")) {
      isBusy = true;
    }
    return {
      url,
      method,
      status: 0,
      durationMs,
      success: false,
      isBusy,
      error: msg,
    };
  }
}

/**
 * SCENARIO 1: Customer Menu Browsing (75% Weight)
 */
async function customerMenuBrowsing(context) {
  const actions = ["MENU_PAGE", "TRACK_ORDER"];
  // If we have created orders, 40% of browse time is checking tracking, 60% loading menu
  const action = context.orderPool.length > 0 && Math.random() < 0.4 ? "TRACK_ORDER" : "MENU_PAGE";

  if (action === "MENU_PAGE") {
    const result = await executeTimedRequest(`${context.baseUrl}/q/${context.qrToken}`);
    return {
      scenario: "CUSTOMER_MENU_BROWSING",
      action: "GET /q/[token]",
      ...result,
    };
  } else {
    // Pick an existing orderId from pool
    const sampleOrderId = context.orderPool[Math.floor(Math.random() * context.orderPool.length)];
    const result = await executeTimedRequest(
      `${context.baseUrl}/api/v1/orders/track?token=${context.qrToken}&orderId=${sampleOrderId}`
    );
    return {
      scenario: "CUSTOMER_MENU_BROWSING",
      action: "GET /api/v1/orders/track",
      ...result,
    };
  }
}

/**
 * SCENARIO 2: Waiter Service & Order Placement (15% Weight)
 */
async function waiterAndOrderPlacement(context) {
  // 50% call-waiter, 50% order placement
  const isOrder = Math.random() < 0.5;

  if (isOrder) {
    const randomItem = context.items[Math.floor(Math.random() * context.items.length)];
    const idempotencyKey = `load_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const payload = {
      token: context.qrToken,
      paymentMethod: "CASH",
      idempotencyKey,
      items: [
        {
          menuItemId: randomItem.id,
          quantity: 1,
        },
      ],
      customerName: "Guest Tester",
      specialInstructions: "Fast delivery please",
    };

    const result = await executeTimedRequest(`${context.baseUrl}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (result.success && result.bodyText) {
      try {
        const json = JSON.parse(result.bodyText);
        if (json.order && json.order.id) {
          context.orderPool.push(json.order.id);
        }
      } catch {
        // non-critical
      }
    }

    return {
      scenario: "WAITER_AND_ORDER",
      action: "POST /api/v1/orders",
      ...result,
    };
  } else {
    const serviceTypes = ["WAITER", "WATER", "CUTLERY", "BILL"];
    const type = serviceTypes[Math.floor(Math.random() * serviceTypes.length)];
    const payload = {
      token: context.qrToken,
      type,
      note: "Automated load test ping",
    };

    const result = await executeTimedRequest(`${context.baseUrl}/api/v1/tables/call-waiter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return {
      scenario: "WAITER_AND_ORDER",
      action: "POST /api/v1/tables/call-waiter",
      ...result,
    };
  }
}

/**
 * SCENARIO 3: Kitchen & Staff Order Polling (10% Weight)
 */
async function kitchenStaffPolling(context) {
  // 80% admin orders polling, 20% system health
  const isAdmin = Math.random() < 0.8;

  if (isAdmin) {
    const result = await executeTimedRequest(
      `${context.baseUrl}/api/v1/orders/admin?restaurantId=${context.restaurant.id}&status=ACTIVE`,
      {
        headers: {
          Cookie: `session=${context.sessionToken}`,
        },
      }
    );

    return {
      scenario: "KITCHEN_STAFF_POLLING",
      action: "GET /api/v1/orders/admin",
      ...result,
    };
  } else {
    const result = await executeTimedRequest(`${context.baseUrl}/api/health`);
    return {
      scenario: "KITCHEN_STAFF_POLLING",
      action: "GET /api/health",
      ...result,
    };
  }
}

/**
 * Weighted Scenario Selector
 * 75% Customer Browsing, 15% Waiter/Order, 10% Kitchen Polling
 */
function pickWeightedScenario() {
  const rand = Math.random();
  if (rand < 0.75) {
    return customerMenuBrowsing;
  } else if (rand < 0.90) {
    return waiterAndOrderPlacement;
  } else {
    return kitchenStaffPolling;
  }
}

module.exports = {
  executeTimedRequest,
  customerMenuBrowsing,
  waiterAndOrderPlacement,
  kitchenStaffPolling,
  pickWeightedScenario,
};
