import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { normalizeUrl } from "@/lib/url";

export async function GET(request: Request) {
  const start = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const urlParam = searchParams.get("url");

    if (!urlParam) {
      return NextResponse.json(
        {
          ok: false,
          error: "URL parameter is required.",
        },
        { status: 400 },
      );
    }

    const url = normalizeUrl(urlParam);

    const review = await prisma.review.findFirst({
      where: { url },
      orderBy: { createdAt: "desc" },
    });

    if (!review) {
      return NextResponse.json(
        {
          ok: false,
          error: "No review found for this URL.",
        },
        { status: 404 },
      );
    }

    const result = review.result as {
      score?: number;
      issues?: unknown[];
      top_improvements?: Array<{ before: string; after: string }>;
      ux?: { score?: number; issues?: unknown[] };
      accessibility?: { score?: number; findings?: unknown[] };
      seo?: { score?: number; findings?: unknown[] };
      visual?: { score?: number; findings?: unknown[] };
    };

    const reportDate = new Date(review.createdAt).toLocaleString();
    const domain = new URL(url).hostname;

    // Generate HTML report
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UX Audit Report - ${domain}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 40px auto; padding: 20px; }
    .header { border-bottom: 2px solid #0070f3; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 24px; margin-bottom: 5px; }
    .header p { color: #666; }
    .section { margin-bottom: 30px; }
    .section h2 { font-size: 18px; margin-bottom: 15px; color: #0070f3; }
    .score-card { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .score-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e9ecef; }
    .score-row:last-child { border-bottom: none; }
    .issue { background: #fff3cd; padding: 10px; margin: 8px 0; border-left: 3px solid #ffc107; }
    .issue.severity-high { border-left-color: #dc3545; background: #f8d7da; }
    .issue.severity-low { border-left-color: #28a745; background: #d4edda; }
    .improvement { background: #d1ecf1; padding: 10px; margin: 8px 0; border-left: 3px solid #17a2b8; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>UX Audit Report</h1>
      <p>${domain}</p>
      <p>Generated on ${reportDate}</p>
    </div>

    <div class="score-card">
      <h2>Website Health Score</h2>
      <div class="score-row">
        <span>UX Score</span>
        <strong>${result.score ?? review.score}/100</strong>
      </div>
      ${review.websiteHealthScore ? `
      <div class="score-row">
        <span>Health Score</span>
        <strong>${review.websiteHealthScore}/100</strong>
      </div>
      ` : ''}
    </div>

    <div class="section">
      <h2>Issues (${result.issues?.length || 0})</h2>
      ${(result.issues || []).slice(0, 10).map((issue: unknown) => {
        const i = issue as { title: string; why: string; severity: string; category: string };
        return `
          <div class="issue severity-${i.severity}">
            <strong>${i.title}</strong> (${i.category})
            <p>${i.why}</p>
          </div>
        `;
      }).join('')}
    </div>

    <div class="section">
      <h2>Top Improvements</h2>
      ${(result.top_improvements || []).slice(0, 3).map((imp: { before: string; after: string }) => `
        <div class="improvement">
          <strong>Before:</strong> ${imp.before}
          <br><strong>After:</strong> ${imp.after}
        </div>
      `).join('')}
    </div>

    ${result.accessibility?.findings && result.accessibility.findings.length > 0 ? `
    <div class="section">
      <h2>Accessibility Findings (Score: ${result.accessibility.score}/100)</h2>
      ${(result.accessibility.findings as Array<{ title: string; why: string }>).slice(0, 5).map(finding => `
        <div class="issue">
          <strong>${finding.title}</strong>
          <p>${finding.why}</p>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${result.seo?.findings && result.seo.findings.length > 0 ? `
    <div class="section">
      <h2>SEO Findings (Score: ${result.seo.score}/100)</h2>
      ${(result.seo.findings as Array<{ title: string; why: string }>).slice(0, 5).map(finding => `
        <div class="issue">
          <strong>${finding.title}</strong>
          <p>${finding.why}</p>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="footer">
      <p>Generated by UX Auditor</p>
      <p>${reportDate}</p>
    </div>
  </div>
</body>
</html>
    `;

    logger.info("api.pdf.success", {
      url,
      durationMs: Date.now() - start,
    });

    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="ux-audit-${domain.replace(/\./g, '-')}.pdf"`,
      },
    });
  } catch (error) {
    logger.error("api.pdf.error", {
      durationMs: Date.now() - start,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate PDF report.",
      },
      { status: 500 },
    );
  }
}
