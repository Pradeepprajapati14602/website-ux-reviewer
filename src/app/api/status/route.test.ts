import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryRaw = vi.fn();
const mockRunOpenAIHealthCheck = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("@/lib/analysis", () => ({
  runOpenAIHealthCheck: mockRunOpenAIHealthCheck,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("GET /api/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all OK when db and llm checks pass", async () => {
    mockQueryRaw.mockResolvedValue([{ ok: 1 }]);
    mockRunOpenAIHealthCheck.mockResolvedValue("OK");

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      backend: "OK",
      database: "OK",
      llm: "OK",
    });
  });

  it("returns database ERROR when query fails", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db down"));
    mockRunOpenAIHealthCheck.mockResolvedValue("OK");

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      backend: "OK",
      database: "ERROR",
      llm: "OK",
    });
  });
});
