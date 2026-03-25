import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const client = createClient(supabaseUrl, serviceRoleKey);

type Payload = {
  player_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const jsonHeaders = { "Content-Type": "application/json" };

// Placeholder implementation for MVP wiring.
// In production this function should call a web push library with VAPID keys.
Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: jsonHeaders,
      status: 405,
    });
  }

  const payload = (await request.json()) as Payload;
  if (!payload.player_id || !payload.title || !payload.body) {
    return new Response(JSON.stringify({ error: "Missing payload fields" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const { data: subscriptions, error } = await client
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("player_id", payload.player_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: jsonHeaders,
      status: 500,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      subscriptions: subscriptions?.length ?? 0,
      note: "Hook web-push send here with VAPID keys.",
      payload,
    }),
    { headers: jsonHeaders, status: 200 },
  );
});
