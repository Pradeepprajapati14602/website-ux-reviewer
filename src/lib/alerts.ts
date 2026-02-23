import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logger";

export type AlertType = "score_drop" | "audit_complete" | "scheduled_audit_failed";

export type AlertData = {
  url: string;
  oldScore?: number;
  newScore: number;
  oldHealthScore?: number;
  newHealthScore?: number;
  timestamp: Date;
};

const ALERT_THRESHOLDS = {
  SCORE_DROP_WARNING: 10,
  SCORE_DROP_CRITICAL: 20,
};

let smtpTransporter: Transporter | null = null;

type AlertParams = {
  type: AlertType;
  data: unknown;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  const enabled = Boolean(host && user && pass && from && Number.isFinite(port));

  return {
    enabled,
    host,
    port,
    user,
    pass,
    from,
    secure,
  };
}

function getEmailRecipients(): string[] {
  const configuredTo = process.env.ALERT_EMAIL_TO || process.env.SMTP_TO || "";
  const recipients = configuredTo
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (recipients.length > 0) {
    return recipients;
  }

  const fallback = process.env.SMTP_USER?.trim();
  return fallback ? [fallback] : [];
}

function getTransporter(): Transporter | null {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  const config = getSmtpConfig();
  if (!config.enabled || !config.host || !config.user || !config.pass) {
    return null;
  }

  smtpTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return smtpTransporter;
}

async function notifyChannels(params: AlertParams): Promise<void> {
  await Promise.allSettled([sendEmail(params), sendSlackWebhook(params)]);
}

export async function sendScoreDropAlert(data: AlertData): Promise<void> {
  const scoreDrop = typeof data.oldScore === "number" ? data.oldScore - data.newScore : undefined;
  const healthScoreDrop =
    typeof data.oldHealthScore === "number" && typeof data.newHealthScore === "number"
      ? data.oldHealthScore - data.newHealthScore
      : undefined;

  const isCritical = typeof scoreDrop === "number" && scoreDrop >= ALERT_THRESHOLDS.SCORE_DROP_CRITICAL;
  const isWarning = typeof scoreDrop === "number" && scoreDrop >= ALERT_THRESHOLDS.SCORE_DROP_WARNING;

  if (!isCritical && !isWarning) {
    return;
  }

  logger.info("alert.score_drop", {
    url: data.url,
    scoreDrop,
    healthScoreDrop,
    severity: isCritical ? "critical" : "warning",
    timestamp: data.timestamp,
  });

  await notifyChannels({
    type: "score_drop",
    data,
  });
}

export async function sendAuditCompleteAlert(url: string, score: number, healthScore: number): Promise<void> {
  const data = {
    url,
    score,
    healthScore,
    timestamp: new Date(),
  };

  logger.info("alert.audit_complete", data);

  await notifyChannels({
    type: "audit_complete",
    data,
  });
}

export async function sendScheduledAuditFailedAlert(url: string, error: string): Promise<void> {
  const data = {
    url,
    error,
    timestamp: new Date(),
  };

  logger.error("alert.scheduled_audit_failed", data);

  await notifyChannels({
    type: "scheduled_audit_failed",
    data,
  });
}

function getEmailSubject(type: AlertType, data: unknown): string {
  switch (type) {
    case "score_drop": {
      const alertData = data as AlertData;
      return `⚠️ Score Drop Alert - ${alertData.url}`;
    }
    case "audit_complete": {
      const completeData = data as { url: string };
      return `✅ Scheduled Audit Complete - ${completeData.url}`;
    }
    case "scheduled_audit_failed": {
      const failedData = data as { url: string };
      return `❌ Scheduled Audit Failed - ${failedData.url}`;
    }
    default:
      return "UX Reviewer Notification";
  }
}

function getEmailTemplate(type: AlertType, data: unknown): string {
  switch (type) {
    case "score_drop": {
      const alertData = data as AlertData;
      const scoreDrop =
        typeof alertData.oldScore === "number" ? alertData.oldScore - alertData.newScore : undefined;
      const healthDrop =
        typeof alertData.oldHealthScore === "number" && typeof alertData.newHealthScore === "number"
          ? alertData.oldHealthScore - alertData.newHealthScore
          : undefined;

      return `
        <html>
          <body>
            <h2>⚠️ Score Drop Alert</h2>
            <p>Website <strong>${alertData.url}</strong> has dropped in score.</p>
            <table cellpadding="6" cellspacing="0" border="1" style="border-collapse: collapse;">
              <tr><td><strong>Old Score</strong></td><td>${alertData.oldScore ?? "-"}/100</td></tr>
              <tr><td><strong>New Score</strong></td><td>${alertData.newScore}/100</td></tr>
              <tr><td><strong>Score Drop</strong></td><td>${scoreDrop ?? "-"} points</td></tr>
              <tr><td><strong>Old Health Score</strong></td><td>${alertData.oldHealthScore ?? "-"}</td></tr>
              <tr><td><strong>New Health Score</strong></td><td>${alertData.newHealthScore ?? "-"}</td></tr>
              <tr><td><strong>Health Drop</strong></td><td>${healthDrop ?? "-"}</td></tr>
            </table>
            <p>Review details in your UX Auditor dashboard.</p>
          </body>
        </html>
      `;
    }
    case "audit_complete": {
      const completeData = data as { url: string; score: number; healthScore: number; timestamp: Date };
      return `
        <html>
          <body>
            <h2>✅ Scheduled Audit Complete</h2>
            <p>Website <strong>${completeData.url}</strong> has completed its scheduled audit.</p>
            <table cellpadding="6" cellspacing="0" border="1" style="border-collapse: collapse;">
              <tr><td><strong>UX Score</strong></td><td>${completeData.score}/100</td></tr>
              <tr><td><strong>Website Health Score</strong></td><td>${completeData.healthScore}/100</td></tr>
              <tr><td><strong>Timestamp</strong></td><td>${new Date(completeData.timestamp).toISOString()}</td></tr>
            </table>
          </body>
        </html>
      `;
    }
    case "scheduled_audit_failed": {
      const failedData = data as { url: string; error: string; timestamp: Date };
      return `
        <html>
          <body>
            <h2>❌ Scheduled Audit Failed</h2>
            <p>Scheduled audit failed for <strong>${failedData.url}</strong>.</p>
            <p><strong>Error:</strong> ${failedData.error}</p>
            <p><strong>Timestamp:</strong> ${new Date(failedData.timestamp).toISOString()}</p>
          </body>
        </html>
      `;
    }
    default:
      return "<p>Notification</p>";
  }
}

export async function sendEmail(params: AlertParams): Promise<void> {
  const transporter = getTransporter();
  const config = getSmtpConfig();
  const recipients = getEmailRecipients();

  if (!transporter || !config.from) {
    logger.warn("email.smtp_not_configured", {
      type: params.type,
      hasHost: Boolean(config.host),
      hasUser: Boolean(config.user),
      hasPass: Boolean(config.pass),
      hasFrom: Boolean(config.from),
    });
    return;
  }

  if (recipients.length === 0) {
    logger.warn("email.no_recipients", { type: params.type });
    return;
  }

  try {
    await transporter.sendMail({
      from: config.from,
      to: recipients.join(","),
      subject: getEmailSubject(params.type, params.data),
      html: getEmailTemplate(params.type, params.data),
    });

    logger.info("email.sent", {
      type: params.type,
      recipientsCount: recipients.length,
    });
  } catch (error) {
    logger.error("email.failed", {
      type: params.type,
      error,
    });
  }
}

export async function sendSlackWebhook(params: AlertParams): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.warn("slack.no_webhook_url", { type: params.type });
    return;
  }

  try {
    const message = getSlackMessage(params.type, params.data);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Slack webhook failed: ${response.status} ${responseText}`);
    }

    logger.info("slack.sent", { type: params.type });
  } catch (error) {
    logger.error("slack.failed", {
      type: params.type,
      error,
    });
  }
}

function getSlackMessage(type: AlertType, data: unknown): { text: string; attachments?: Array<unknown> } {
  switch (type) {
    case "score_drop": {
      const alertData = data as AlertData;
      const scoreDrop =
        typeof alertData.oldScore === "number" ? alertData.oldScore - alertData.newScore : undefined;

      return {
        text: `⚠️ Score Drop Alert: ${alertData.url}`,
        attachments: [
          {
            color: typeof scoreDrop === "number" && scoreDrop >= 20 ? "danger" : "warning",
            fields: [
              { title: "URL", value: alertData.url, short: false },
              { title: "Old Score", value: `${alertData.oldScore ?? "-"}/100`, short: true },
              { title: "New Score", value: `${alertData.newScore}/100`, short: true },
              { title: "Drop", value: `${scoreDrop ?? "-"} points`, short: true },
              { title: "Old Health", value: `${alertData.oldHealthScore ?? "-"}`, short: true },
              { title: "New Health", value: `${alertData.newHealthScore ?? "-"}`, short: true },
            ],
          },
        ],
      };
    }
    case "audit_complete": {
      const completeData = data as { url: string; score: number; healthScore: number };
      return {
        text: `✅ Audit Complete: ${completeData.url}`,
        attachments: [
          {
            color: "good",
            fields: [
              { title: "URL", value: completeData.url, short: false },
              { title: "UX Score", value: `${completeData.score}/100`, short: true },
              { title: "Health Score", value: `${completeData.healthScore}/100`, short: true },
            ],
          },
        ],
      };
    }
    case "scheduled_audit_failed": {
      const failedData = data as { url: string; error: string };
      return {
        text: `❌ Scheduled Audit Failed: ${failedData.url}`,
        attachments: [
          {
            color: "danger",
            fields: [
              { title: "URL", value: failedData.url, short: false },
              { title: "Error", value: failedData.error, short: false },
            ],
          },
        ],
      };
    }
    default:
      return { text: `Notification: ${type}` };
  }
}
