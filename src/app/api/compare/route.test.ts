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

describe("POST /api/compare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizeUrl.mockImplementation((value: string) => `https://${value}`);
  });

  it("returns left/right reviews with score difference", async () => {
    mockAnalyzeAndSave
      .mockResolvedValueOnce({ score: 70, issues: [], top_improvements: [] })
      .mockResolvedValueOnce({ score: 85, issues: [], top_improvements: [] });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leftUrl: "left.example.com",
          rightUrl: "right.example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.left.url).toBe("https://left.example.com");
    expect(body.right.url).toBe("https://right.example.com");
    expect(body.scoreDifference).toBe(15);
    expect(mockAnalyzeAndSave).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when comparison fails", async () => {
    mockAnalyzeAndSave.mockRejectedValue(new Error("compare failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leftUrl: "left.example.com",
          rightUrl: "right.example.com",
        }),
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("compare failed");
  });
});
