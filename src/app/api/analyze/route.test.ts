import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNormalizeUrl = vi.fn();
const mockAnalyzeAndSave = vi.fn();

vi.mock("@/lib/url", () => ({
  normalizeUrl: mockNormalizeUrl,
}));

vi.mock("@/lib/review-service", () => ({
  analyzeAndSave: mockAnalyzeAndSave,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizeUrl.mockReturnValue("https://example.com");
  });

  it("returns review payload on success", async () => {
    mockAnalyzeAndSave.mockResolvedValue({
      score: 82,
      issues: [],
      top_improvements: [],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "example.com" }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://example.com");
    expect(body.review.score).toBe(82);
    expect(mockNormalizeUrl).toHaveBeenCalledWith("example.com");
    expect(mockAnalyzeAndSave).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when analysis fails", async () => {
    mockAnalyzeAndSave.mockRejectedValue(new Error("analysis failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "example.com" }),
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("analysis failed");
  });
});
