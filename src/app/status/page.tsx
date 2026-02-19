"use client";

import { useEffect, useState } from "react";

type StatusPayload = {
  backend: "OK" | "ERROR";
  database: "OK" | "ERROR";
  llm: "OK" | "ERROR";
};

export default function StatusPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusPayload | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStatus() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/status", { method: "GET", cache: "no-store" });
        if (!response.ok) {
          throw new Error("Status check failed.");
        }

        const data = (await response.json()) as StatusPayload;
        if (mounted) {
          setStatus(data);
        }
      } catch (requestError) {
        if (mounted) {
          setError(requestError instanceof Error ? requestError.message : "Unexpected error.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadStatus();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="space-y-4">
      <h2 className="text-2xl font-semibold">Status</h2>

      {loading ? <p className="text-sm">Checking services...</p> : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {status ? (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
          <p>Backend: {status.backend}</p>
          <p>Database: {status.database}</p>
          <p>LLM: {status.llm}</p>
        </div>
      ) : null}
    </main>
  );
}