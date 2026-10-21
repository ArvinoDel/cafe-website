import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecret) {
    console.error("[sweep-reservations] Missing Supabase environment variables");
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseSecret);
  const { data, error } = await supabase.rpc("sweep_reservations");

  if (error) {
    console.error("[sweep-reservations] Sweep error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
