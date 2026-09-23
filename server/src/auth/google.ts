import crypto from "crypto";

import { createRemoteJWKSet, jwtVerify } from "jose";

import type { Kv } from "../store/kv";

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string | null };

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const STATE_TTL_SECONDS = 600;

/** Connexion Google : authorization code + PKCE + state (anti-CSRF), vérification du id_token. */
export class GoogleOAuth {
  public constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly kv: Kv,
  ) {}

  public async authorizationUrl(): Promise<string> {
    const state = crypto.randomBytes(24).toString("base64url");
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    await this.kv.set(`oauth:${state}`, verifier, STATE_TTL_SECONDS);
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  public async handleCallback(code: string, state: string): Promise<GoogleIdentity> {
    const verifier = await this.kv.get(`oauth:${state}`);
    if (verifier === null) {
      throw new Error("invalid or expired oauth state");
    }
    await this.kv.del(`oauth:${state}`);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`google token exchange failed (${response.status})`);
    }
    const { id_token: idToken } = (await response.json()) as { id_token?: string };
    if (typeof idToken !== "string") {
      throw new Error("google response without id_token");
    }
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: this.clientId,
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new Error("google id_token without sub/email");
    }
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  }
}
