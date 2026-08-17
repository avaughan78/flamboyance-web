import { createClient } from '@supabase/supabase-js'

// Same project, same publishable key the native app uses — this client only
// ever acts as an anonymously-authenticated player, gated by the same RLS
// policies as the iOS app.
export const supabase = createClient(
  'https://uockbafewpevbpxfelde.supabase.co',
  'sb_publishable_4v8Z4pmzHHHAUXD2v-z2Ew_rly0xL2q'
)
