import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import type { Json } from "@/integrations/supabase/types";

export interface StructuredErrorLogInput {
  source: "checkout" | "payment" | "auth" | "shipping" | "admin" | "server";
  action: string;
  targetType?: string | undefined;
  targetId?: string | undefined;
  actorEmail?: string | null | undefined;
  error: unknown;
  context?: Record<string, unknown> | undefined;
}

interface DynamicAuditLogsInsertClient {
  from: (table: string) => {
    insert: (row: {
      actor_email: string;
      action: string;
      target_type: string;
      target_id: string;
      details: Json;
    }) => Promise<{ error: { message?: string } | null }>;
  };
}

/**
 * Extracts a safe, diagnostic message without leaking secrets or raw stack traces to clients.
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unexpected error";
  }
}

/**
 * Writes structured server error events into public.audit_logs without throwing if logging fails.
 */
export async function logStructuredServerError(input: StructuredErrorLogInput): Promise<void> {
  const message = extractErrorMessage(input.error);
  console.error(`[${input.source.toUpperCase()}] ${input.action}:`, message);

  const actorEmail = input.actorEmail || "system@cavenhusrt.com";
  const actionName = `error_${input.source}_${input.action}`.slice(0, 120);
  const targetType = input.targetType || input.source;
  const targetId = input.targetId || "unknown";
  const payload = {
    source: input.source,
    message: message.slice(0, 1000),
    ...(input.context || {}),
    timestamp: new Date().toISOString(),
  };

  try {
    const sql = getDb();
    if (sql) {
      await sql`
        INSERT INTO public.audit_logs (actor_email, action, target_type, target_id, details)
        VALUES (${actorEmail}, ${actionName}, ${targetType}, ${targetId}, ${sql.json(payload as Json)})
      `;
      return;
    }

    const client = supabaseAdmin as unknown as DynamicAuditLogsInsertClient;
    await client.from("audit_logs").insert({
      actor_email: actorEmail,
      action: actionName,
      target_type: targetType,
      target_id: targetId,
      details: payload as unknown as Json,
    });
  } catch (logErr) {
    console.warn("[Logger] Failed to persist error audit record:", extractErrorMessage(logErr));
  }
}
