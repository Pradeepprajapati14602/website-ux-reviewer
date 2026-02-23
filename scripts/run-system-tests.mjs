import { execSync, spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const INITIAL_PORT = Number(process.env.SYSTEM_TEST_PORT || "4300");

const checks = [
  {
    name: "Home page reachable",
    method: "GET",
    path: "/",
    expectedStatus: 200,
  },
  {
    name: "Status page reachable",
    method: "GET",
    path: "/status",
    expectedStatus: 200,
  },
  {
    name: "History page reachable",
    method: "GET",
    path: "/history",
    expectedStatus: 200,
  },
  {
    name: "API status responds",
    method: "GET",
    path: "/api/status",
    expectedStatus: 200,
  },
  {
    name: "Analyze validation works",
    method: "POST",
    path: "/api/analyze",
    expectedStatus: 400,
    body: { url: "" },
  },
  {
    name: "Compare validation works",
    method: "POST",
    path: "/api/compare",
    expectedStatus: 400,
    body: { leftUrl: "", rightUrl: "" },
  },
  {
    name: "Schedule create validation works",
    method: "POST",
    path: "/api/schedule",
    expectedStatus: 400,
    body: {},
  },
  {
    name: "Schedule delete validation works",
    method: "DELETE",
    path: "/api/schedule",
    expectedStatus: 400,
    body: {},
  },
  {
    name: "PDF validation works",
    method: "GET",
    path: "/api/pdf",
    expectedStatus: 400,
  },
];

function startServer() {
  const port = globalThis.__SYSTEM_TEST_PORT__;

  return spawn("npm", ["run", "start", "--", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
}

function getBaseUrl() {
  return `http://127.0.0.1:${globalThis.__SYSTEM_TEST_PORT__}`;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.on("error", () => {
      resolve(false);
    });

    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

async function pickAvailablePort(startPort) {
  let port = startPort;
  const maxAttempts = 30;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortFree(port);
    if (free) {
      return port;
    }
    port += 1;
  }

  throw new Error("No available port found for system tests.");
}

function stopServer(server) {
  if (!server || server.killed || !server.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: "ignore" });
      return;
    }

    process.kill(server.pid, "SIGTERM");
  } catch {
    // no-op: process may already be gone
  }
}

async function waitForServer(timeoutMs = 120000) {
  const baseUrl = getBaseUrl();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function runCheck(check) {
  const baseUrl = getBaseUrl();
  const init = {
    method: check.method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (check.body) {
    init.body = JSON.stringify(check.body);
  }

  const response = await fetch(`${baseUrl}${check.path}`, init);

  if (response.status !== check.expectedStatus) {
    const responseText = await response.text();
    throw new Error(
      `${check.name} failed: expected ${check.expectedStatus}, got ${response.status}. Response: ${responseText.slice(0, 300)}`,
    );
  }

  console.log(`✔ ${check.name} (${response.status})`);
}

function wireLogs(serverProcess) {
  serverProcess.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.log(`[system:start] ${text}`);
    }
  });

  serverProcess.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.error(`[system:start:err] ${text}`);
    }
  });
}

async function run() {
  globalThis.__SYSTEM_TEST_PORT__ = await pickAvailablePort(INITIAL_PORT);
  const baseUrl = getBaseUrl();

  console.log(`\n🚀 Starting system tests at ${baseUrl}\n`);

  const server = startServer();
  wireLogs(server);

  try {
    await waitForServer();

    for (const check of checks) {
      await runCheck(check);
    }

    console.log("\n✅ System tests passed\n");
  } finally {
    stopServer(server);
  }
}

run().catch((error) => {
  console.error(`\n❌ System tests failed: ${error.message}\n`);
  process.exit(1);
});
