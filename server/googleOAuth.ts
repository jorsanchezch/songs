/** Google OAuth token exchange for YouTube playlist export (Authorization Code + PKCE). */

export type GoogleOAuthEnv = {
  /** Public OAuth web client id. Falls back to the Songbook default. */
  YOUTUBE_OAUTH_CLIENT_ID?: string
  /** Confidential client secret — Worker/local env only, never in the frontend. */
  YOUTUBE_OAUTH_CLIENT_SECRET?: string
}

const DEFAULT_CLIENT_ID =
  '1005651847868-k4oas55ikbu34alfcggqts39tel93j0r.apps.googleusercontent.com'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type GoogleTokenRequest =
  | {
      grant_type: 'authorization_code'
      code: string
      code_verifier: string
      redirect_uri: string
    }
  | {
      grant_type: 'refresh_token'
      refresh_token: string
    }

export type GoogleTokenResult = {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
}

export function googleOAuthClientId(env: GoogleOAuthEnv): string {
  return env.YOUTUBE_OAUTH_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID
}

export function googleOAuthConfigured(env: GoogleOAuthEnv): boolean {
  return Boolean(env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim())
}

export async function exchangeGoogleToken(
  env: GoogleOAuthEnv,
  input: GoogleTokenRequest,
): Promise<{ ok: true; token: GoogleTokenResult } | { ok: false; status: number; error: string }> {
  const secret = env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim()
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error:
        'Falta YOUTUBE_OAUTH_CLIENT_SECRET en el Worker. Configúralo con: npx wrangler secret put YOUTUBE_OAUTH_CLIENT_SECRET',
    }
  }
  const body = new URLSearchParams({
    client_id: googleOAuthClientId(env),
    client_secret: secret,
  })
  if (input.grant_type === 'authorization_code') {
    if (!input.code.trim() || !input.code_verifier.trim() || !input.redirect_uri.trim()) {
      return { ok: false, status: 400, error: 'Faltan code, code_verifier o redirect_uri.' }
    }
    body.set('grant_type', 'authorization_code')
    body.set('code', input.code.trim())
    body.set('code_verifier', input.code_verifier.trim())
    body.set('redirect_uri', input.redirect_uri.trim())
  } else {
    if (!input.refresh_token.trim()) {
      return { ok: false, status: 400, error: 'Falta refresh_token.' }
    }
    body.set('grant_type', 'refresh_token')
    body.set('refresh_token', input.refresh_token.trim())
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    json = {}
  }
  if (!response.ok) {
    const detail =
      (typeof json.error_description === 'string' && json.error_description) ||
      (typeof json.error === 'string' && json.error) ||
      text ||
      `Google respondió ${response.status}`
    return { ok: false, status: response.status, error: detail }
  }
  const access = typeof json.access_token === 'string' ? json.access_token : ''
  const expires = typeof json.expires_in === 'number' ? json.expires_in : Number(json.expires_in)
  if (!access || !Number.isFinite(expires)) {
    return { ok: false, status: 502, error: 'Google no devolvió un token válido.' }
  }
  return {
    ok: true,
    token: {
      access_token: access,
      refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
      expires_in: expires,
      token_type: typeof json.token_type === 'string' ? json.token_type : undefined,
      scope: typeof json.scope === 'string' ? json.scope : undefined,
    },
  }
}
