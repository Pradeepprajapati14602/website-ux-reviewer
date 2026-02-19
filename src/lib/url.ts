export function normalizeUrl(input: string): string {
  const value = input.trim();

  if (!value) {
    throw new Error("URL is required.");
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("Invalid URL format.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  return parsed.toString();
}