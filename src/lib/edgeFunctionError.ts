import { FunctionsHttpError } from '@supabase/supabase-js'

/** `supabase.functions.invoke()` throws `FunctionsHttpError` on any
 * non-2xx response, but its own `.message` is always the same generic
 * string ("Edge Function returned a non-2xx status code") — the actual
 * `{ error: "..." }` body every edge function in this project returns has
 * to be read separately off `error.context` (the raw Response). Without
 * this, every real server message (e.g. "This party has already
 * started") is invisible and every failure looks identical and
 * unexplained to the user. Mirrors the native apps'
 * edgeFunctionErrorMessage helper. */
export async function edgeFunctionErrorMessage(err: unknown): Promise<string | null> {
  if (!(err instanceof FunctionsHttpError)) return null
  try {
    const body = await err.context.json()
    if (typeof body?.error === 'string') return body.error
    if (typeof body?.message === 'string') return body.message
  } catch {
    // body wasn't JSON — nothing more specific to surface
  }
  return null
}
