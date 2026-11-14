export interface ShiprocketConfig {
  email?: string;
  password?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isShiprocketConfigured(): boolean {
  return Boolean(process.env["SHIPROCKET_EMAIL"] && process.env["SHIPROCKET_PASSWORD"]);
}

/**
 * Authenticates with Shiprocket external API and caches the JWT token.
 */
export async function getShiprocketAuthToken(): Promise<string | null> {
  const email = process.env["SHIPROCKET_EMAIL"];
  const password = process.env["SHIPROCKET_PASSWORD"];

  if (!email || !password) return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 300_000) {
    return cachedToken.token;
  }

  try {
    const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { token?: string };
    if (!data.token) return null;

    // Cache token for 23 hours (Shiprocket tokens expire in 24 hours)
    cachedToken = {
      token: data.token,
      expiresAt: now + 23 * 60 * 60 * 1000,
    };

    return cachedToken.token;
  } catch (error) {
    console.error("Shiprocket authentication error:", error);
    return null;
  }
}

/**
 * Tracks a shipment status using AWB or Order ID via Shiprocket API.
 */
export async function trackShipment(identifier: string) {
  if (!isShiprocketConfigured()) {
    return {
      configured: false,
      message: "Shiprocket shipping tracking is not yet configured.",
    };
  }

  const token = await getShiprocketAuthToken();
  if (!token) {
    return {
      configured: true,
      error: "Failed to authenticate with Shiprocket API.",
    };
  }

  try {
    const res = await fetch(
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${encodeURIComponent(identifier)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      return {
        configured: true,
        error: `Shiprocket responded with status ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      configured: true,
      success: true,
      trackingData: data,
    };
  } catch (error) {
    return {
      configured: true,
      error: error instanceof Error ? error.message : "Error querying Shiprocket tracking API.",
    };
  }
}
