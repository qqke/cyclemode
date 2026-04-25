import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  getServiceClient,
  requireAdminPassword
} from "../_shared/supabase.ts";

type RequestBody = {
  password?: string;
  reservationId?: string;
  status?: "completed";
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "POST only." }, 405);
  }

  try {
    const body = (await request.json()) as RequestBody;
    requireAdminPassword(body.password);

    if (!body.reservationId || body.status !== "completed") {
      return jsonResponse({ error: "更新内容が正しくありません。" }, 400);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("reservations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", body.reservationId)
      .select("id,status,completed_at")
      .single();

    if (error) throw error;

    return jsonResponse({ reservation: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ステータス更新に失敗しました。";
    return jsonResponse({ error: message }, 401);
  }
});
