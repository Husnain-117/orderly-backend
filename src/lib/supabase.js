import { createClient } from '@supabase/supabase-js';

let supabaseAdminInstance = null;

export function getSupabaseAdmin() {
  if (supabaseAdminInstance) return supabaseAdminInstance;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('supabase_not_configured');
  }
  supabaseAdminInstance = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAdminInstance;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
