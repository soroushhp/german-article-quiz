import { createClient } from "@supabase/supabase-js";
const supabaseUrl = "https://sqgkxntbywjhdpxbosgp.supabase.co";
const supabaseKey = "sb_publishable_DqJmb6V_5TZ2U1kB8H3ACg_Es12uDEQ";
export const supabase = createClient(supabaseUrl, supabaseKey);