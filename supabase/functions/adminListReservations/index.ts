import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  getServiceClient,
  getTokyoDate,
  requireAdminPassword
} from "../_shared/supabase.ts";

type RequestBody = {
  password?: string;
};

type ReservationRow = {
  id: string;
  event_date: string;
  queue_number: number;
  device_hash: string;
  status: "waiting" | "completed";
  reserved_at: string;
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

    const supabase = getServiceClient();
    const eventDate = getTokyoDate();
    const { data, error } = await supabase
      .from("reservations")
      .select("id,event_date,queue_number,device_hash,status,reserved_at")
      .eq("event_date", eventDate)
      .order("queue_number", { ascending: true });

    if (error) throw error;

    const reservations = ((data ?? []) as ReservationRow[]).map(
      ({ device_hash, ...reservation }) => ({
        ...reservation,
        device_hash_short: device_hash.slice(0, 10)
      })
    );

    return jsonResponse({ reservations });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "予約一覧の取得に失敗しました。";
    return jsonResponse({ error: message }, 401);
  }
});
