import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  getServiceClient,
  getTokyoDate,
  hashDeviceId
} from "../_shared/supabase.ts";

type RequestBody = {
  action?: "get" | "create";
  deviceId?: string;
  ageConfirmed?: boolean;
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
    if (!body.deviceId || body.deviceId.length < 32) {
      return jsonResponse({ error: "端末IDを確認できませんでした。" }, 400);
    }

    const supabase = getServiceClient();
    const eventDate = getTokyoDate();
    const deviceHash = await hashDeviceId(body.deviceId);
    const action = body.action ?? "create";

    if (action === "get") {
      const { data, error } = await supabase.rpc("get_own_reservation", {
        p_event_date: eventDate,
        p_device_hash: deviceHash
      });

      if (error) throw error;
      return jsonResponse({ reservation: data ?? null });
    }

    const { data, error } = await supabase.rpc("create_or_get_reservation", {
      p_event_date: eventDate,
      p_device_hash: deviceHash,
      p_age_confirmed: body.ageConfirmed === true
    });

    if (error) {
      if (error.message.includes("AGE_CONFIRMATION_REQUIRED")) {
        return jsonResponse({ error: "16歳以上であることを確認してください。" }, 400);
      }
      throw error;
    }

    return jsonResponse({ reservation: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "予約処理に失敗しました。";
    return jsonResponse({ error: message }, 500);
  }
});
