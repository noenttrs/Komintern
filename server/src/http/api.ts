import type { IncomingMessage } from "http";

import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import type { AdminService } from "../admin/service";
import { ApiError, PENDING_REGISTRATION_SECONDS, accountView } from "../auth/accounts";
import { allow } from "../auth/rateLimit";
import type { User } from "../store/users";
import { SessionService } from "../auth/sessions";
import { log } from "../logger";
import type { Services } from "../services";

const SESSION_COOKIE = "sid";
/** Inscription en attente, liée au navigateur qui l'a faite (voir AccountService.register). */
const REGISTRATION_COOKIE = "reg";
/** État OAuth Google, lié au navigateur qui a lancé la connexion (anti « login CSRF »). */
const OAUTH_STATE_COOKIE = "gstate";

function readCookie(request: IncomingMessage, name: string): string | undefined {
  const header = request.headers.cookie;
  return header === undefined ? undefined : parseCookie(header)[name];
}

type AuthedRequest = Request & { userId?: string; sessionId?: string };

export function clientIp(request: IncomingMessage): string {
  const cf = request.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf !== "") {
    return cf;
  }
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded !== "") {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.socket.remoteAddress ?? "unknown";
}

export function sessionIdFrom(request: IncomingMessage): string | undefined {
  const header = request.headers.cookie;
  return header === undefined ? undefined : parseCookie(header)[SESSION_COOKIE];
}

export function createApi(services: Services, admin: AdminService, publicRooms: () => unknown[] = () => []): express.Router {
  const { accounts, sessions, config } = services;
  const router = express.Router();
  router.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
  });

  const setSessionCookie = (response: Response, id: string): void => {
    response.append(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE, id, {
        httpOnly: true,
        secure: config.secureCookies,
        sameSite: "lax",
        path: "/",
        maxAge: SessionService.ttlSeconds,
      }),
    );
  };
  const clearSessionCookie = (response: Response): void => {
    response.append("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { httpOnly: true, secure: config.secureCookies, sameSite: "lax", path: "/", maxAge: 0 }));
  };
  const startSession = async (response: Response, user: User): Promise<void> => {
    setSessionCookie(response, await sessions.create(user.id));
    response.json({ user: accountView(user, true) });
  };
  /** Connexion par mot de passe : si la 2FA est active, on renvoie un défi au lieu de la session. */
  const startSessionOrChallenge = async (response: Response, user: User): Promise<void> => {
    if (services.security.needsTotp(user)) {
      response.json({ totpRequired: true, token: await services.security.createLoginChallenge(user.id) });
      return;
    }
    await startSession(response, user);
  };

  router.use(express.json({ limit: "10kb" }));
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  // Anti-CSRF : toute requête qui modifie des données doit venir de notre propre origine.
  router.use((request, _response, next) => {
    if (request.method === "GET" || request.method === "HEAD") {
      next();
      return;
    }
    const origin = request.headers.origin;
    if (origin === undefined || !config.trustedOrigins.includes(origin)) {
      next(new ApiError(403, "bad_origin"));
      return;
    }
    next();
  });

  router.use(async (request: AuthedRequest, _response, next) => {
    try {
      const sessionId = sessionIdFrom(request);
      const userId = await sessions.resolve(sessionId);
      if (userId !== null) {
        request.userId = userId;
        request.sessionId = sessionId;
      }
      next();
    } catch {
      next(); // Redis indisponible : on continue en invité.
    }
  });

  const requireUser = (request: AuthedRequest): string => {
    if (request.userId === undefined) {
      throw new ApiError(401, "unauthorized");
    }
    return request.userId;
  };

  const route =
    (handler: (request: AuthedRequest, response: Response) => Promise<void>) =>
    (request: AuthedRequest, response: Response, next: NextFunction): void => {
      handler(request, response).catch(next);
    };

  // Surveillance (UptimeRobot, Healthchecks…) : 200 si tout va bien, 503 si une base ne répond plus.
  router.get("/health", async (_request, response) => {
    const withTimeout = <T,>(promise: Promise<T>): Promise<T | false> =>
      Promise.race([promise, new Promise<false>((resolve) => setTimeout(() => resolve(false), 2_000).unref())]);
    const [redis, mongo] = await Promise.all([
      withTimeout(services.kv.ping()).catch(() => false),
      withTimeout(services.users.countAll().then(() => true)).catch(() => false),
    ]);
    const ok = redis === true && mongo === true;
    response.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", redis: redis === true, mongo: mongo === true });
  });

  router.get("/config", (_request, response) => {
    response.json({
      googleEnabled: services.google !== undefined,
      emailDelivery: config.resendApiKey !== undefined,
      legal: config.legal,
      donationUrl: config.donationUrl,
      pushPublicKey: services.push.publicKey ?? null,
    });
  });

  /** Routes à code email : limite par IP en plus des limites par email du service. */
  const limitCodeRoute = async (request: Request): Promise<void> => {
    if (!(await allow(services.kv, "code-route", clientIp(request), 30, 900))) {
      throw new ApiError(429, "too_many_requests");
    }
  };

  router.post("/auth/register", route(async (request, response) => {
    const token = await accounts.register(request.body ?? {}, clientIp(request));
    response.append(
      "Set-Cookie",
      serializeCookie(REGISTRATION_COOKIE, token, { httpOnly: true, secure: config.secureCookies, sameSite: "strict", path: "/api/auth", maxAge: PENDING_REGISTRATION_SECONDS }),
    );
    response.status(202).json({ status: "code_sent" });
  }));

  router.post("/auth/resend", route(async (request, response) => {
    await limitCodeRoute(request);
    await accounts.resendVerification(request.body?.email);
    response.status(202).json({ status: "code_sent" });
  }));

  router.post("/auth/verify", route(async (request, response) => {
    await limitCodeRoute(request);
    const user = await accounts.verifyEmail(request.body?.email, request.body?.code, readCookie(request, REGISTRATION_COOKIE));
    response.append("Set-Cookie", serializeCookie(REGISTRATION_COOKIE, "", { httpOnly: true, secure: config.secureCookies, sameSite: "strict", path: "/api/auth", maxAge: 0 }));
    await startSession(response, user);
  }));

  router.post("/auth/login", route(async (request, response) => {
    await startSessionOrChallenge(response, await accounts.login(request.body ?? {}, clientIp(request)));
  }));

  router.post("/auth/login/totp", route(async (request, response) => {
    await startSession(response, await services.security.completeLoginChallenge(request.body?.token, request.body?.code));
  }));

  router.post("/auth/logout", route(async (request, response) => {
    if (request.sessionId !== undefined) {
      await sessions.destroy(request.sessionId, request.userId);
    }
    clearSessionCookie(response);
    response.status(204).end();
  }));

  router.post("/auth/password/forgot", route(async (request, response) => {
    await limitCodeRoute(request);
    await accounts.requestPasswordReset(request.body?.email);
    response.status(202).json({ status: "code_sent" });
  }));

  router.post("/auth/password/reset", route(async (request, response) => {
    await limitCodeRoute(request);
    await startSessionOrChallenge(response, await accounts.resetPassword(request.body ?? {}));
  }));

  router.get("/auth/google", route(async (_request, response) => {
    if (services.google === undefined) {
      throw new ApiError(404, "google_disabled");
    }
    const url = await services.google.authorizationUrl();
    const state = new URL(url).searchParams.get("state") ?? "";
    // Lax : le cookie revient avec la redirection de Google (navigation de premier niveau).
    response.append("Set-Cookie", serializeCookie(OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: config.secureCookies, sameSite: "lax", path: "/api/auth/google", maxAge: 600 }));
    response.redirect(302, url);
  }));

  router.get("/auth/google/callback", async (request: AuthedRequest, response: Response) => {
    const back = (query: string): void => response.redirect(302, `${config.publicUrl}/${query}`);
    const { code, state, error } = request.query;
    const expectedState = readCookie(request, OAUTH_STATE_COOKIE);
    response.append("Set-Cookie", serializeCookie(OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: config.secureCookies, sameSite: "lax", path: "/api/auth/google", maxAge: 0 }));
    // L'état doit venir de ce navigateur : un lien de callback fabriqué par un tiers est refusé.
    if (services.google === undefined || typeof code !== "string" || typeof state !== "string" || error !== undefined || expectedState === undefined || expectedState !== state) {
      back("?auth=error");
      return;
    }
    try {
      const user = await accounts.loginWithGoogle(await services.google.handleCallback(code, state));
      if (services.security.needsTotp(user)) {
        back(`connexion?totp=${await services.security.createLoginChallenge(user.id)}`);
        return;
      }
      setSessionCookie(response, await sessions.create(user.id));
      back(user.displayName === null ? "profil?setup=1" : "?auth=ok");
    } catch (callbackError) {
      log.warn("google login failed", { message: callbackError instanceof Error ? callbackError.message : String(callbackError) });
      back(callbackError instanceof ApiError && callbackError.code === "banned" ? "?auth=banned" : "?auth=error");
    }
  });

  // Invité : 200 avec user null (pas d'erreur 401 dans la console du navigateur à chaque visite).
  router.get("/me", route(async (request, response) => {
    const user = request.userId === undefined ? null : await services.users.findById(request.userId);
    response.json({ user: user === null ? null : accountView(user, true) });
  }));

  /** Le joueur a lu ses avertissements de modération. */
  router.post("/me/warnings/seen", route(async (request, response) => {
    const userId = requireUser(request);
    const user = await services.users.findById(userId);
    if (user !== null && user.warnings.some((warning) => warning.seenAt === null)) {
      const now = new Date();
      await services.users.update(userId, { warnings: user.warnings.map((warning) => (warning.seenAt === null ? { ...warning, seenAt: now } : warning)) });
    }
    response.status(204).end();
  }));

  router.get("/me/games", route(async (request, response) => {
    response.json({ games: await services.gameLogs.gamesForUser(requireUser(request), 30) });
  }));

  router.post("/me/totp/setup", route(async (request, response) => {
    response.json(await services.security.beginTotpSetup(requireUser(request)));
  }));
  router.post("/me/totp/enable", route(async (request, response) => {
    await services.security.confirmTotpSetup(requireUser(request), request.body?.code);
    response.status(204).end();
  }));
  router.post("/me/totp/disable", route(async (request, response) => {
    await services.security.disableTotp(requireUser(request), request.body?.code);
    response.status(204).end();
  }));
  router.post("/me/email", route(async (request, response) => {
    await services.security.requestEmailChange(requireUser(request), request.body ?? {});
    response.status(202).json({ status: "code_sent" });
  }));
  router.post("/me/email/confirm", route(async (request, response) => {
    const user = await services.security.confirmEmailChange(requireUser(request), request.body?.code);
    response.json({ user: accountView(user, true) });
  }));

  router.patch("/me", route(async (request, response) => {
    const user = await accounts.setDisplayName(requireUser(request), request.body?.displayName);
    response.json({ user: accountView(user, true) });
  }));

  router.delete("/me", route(async (request, response) => {
    await accounts.deleteAccount(requireUser(request));
    clearSessionCookie(response);
    response.status(204).end();
  }));

  router.get("/users/:id/profile", route(async (request, response) => {
    response.json({ profile: await accounts.profile(requireUser(request), String(request.params.id)) });
  }));

  router.get("/friends", route(async (request, response) => {
    response.json(await services.friendService.list(requireUser(request)));
  }));

  router.get("/friends/leaderboard", route(async (request, response) => {
    response.json({ leaderboard: await services.friendService.leaderboard(requireUser(request)) });
  }));

  router.post("/friends/requests", route(async (request, response) => {
    const status = await services.friendService.request(requireUser(request), request.body?.displayName);
    response.status(201).json({ status });
  }));

  router.post("/friends/:userId/accept", route(async (request, response) => {
    await services.friendService.accept(requireUser(request), String(request.params.userId));
    response.status(204).end();
  }));

  router.delete("/friends/:userId", route(async (request, response) => {
    await services.friendService.remove(requireUser(request), String(request.params.userId));
    response.status(204).end();
  }));

  // Mesure d'audience anonyme (voir analytics/audience.ts) ; toujours 204, même en cas d'erreur.
  router.post("/visit", (request, response) => {
    const ip = clientIp(request);
    // Limite par IP : empêche de gonfler les compteurs d'audience.
    void allow(services.kv, "visit", ip, 120, 3600)
      .then((allowed) => (allowed ? services.audience.record(request.body?.path, ip, String(request.headers["user-agent"] ?? "")) : undefined))
      .catch(() => undefined);
    response.status(204).end();
  });

  router.get("/rooms/public", (_request, response) => {
    response.json({ rooms: publicRooms() });
  });

  router.post("/contact", route(async (request, response) => {
    await services.contactService.submit(request.body ?? {}, request.userId ?? null, clientIp(request));
    response.status(202).json({ status: "sent" });
  }));

  // ---------------------------------------------------------------- administration
  // Rôle admin + session élevée par TOTP ; tout autre visiteur reçoit 404 (la zone n'existe pas).
  const requireAdmin = async (request: AuthedRequest): Promise<void> => {
    if (!(await admin.isAdmin(request.userId))) throw new ApiError(404, "not_found");
  };
  const requireElevated = async (request: AuthedRequest): Promise<void> => {
    await requireAdmin(request);
    if (!(await admin.isElevated(request.userId, request.sessionId))) throw new ApiError(401, "totp_required");
  };

  router.get("/admin/session", route(async (request, response) => {
    await requireAdmin(request);
    response.json({ elevated: await admin.isElevated(request.userId, request.sessionId) });
  }));
  router.post("/admin/session", route(async (request, response) => {
    await requireAdmin(request);
    await admin.elevate(request.userId as string, request.sessionId as string, request.body?.code);
    response.json({ elevated: true });
  }));
  router.get("/admin/stats", route(async (request, response) => {
    await requireElevated(request);
    response.json(await admin.stats());
  }));
  router.get("/admin/audience", route(async (request, response) => {
    await requireElevated(request);
    response.json(await services.audience.summary(30));
  }));
  router.get("/admin/reports", route(async (request, response) => {
    await requireElevated(request);
    response.json({ reports: await admin.listReports(request.query.status) });
  }));
  router.get("/admin/reports/:id", route(async (request, response) => {
    await requireElevated(request);
    response.json(await admin.report(String(request.params.id)));
  }));
  router.post("/admin/reports/:id/reveal", route(async (request, response) => {
    await requireElevated(request);
    response.json({ identities: await admin.revealReport(String(request.params.id)) });
  }));
  router.post("/admin/reports/:id/resolve", route(async (request, response) => {
    await requireElevated(request);
    await admin.resolveReport(String(request.params.id), request.body?.note);
    response.status(204).end();
  }));
  router.post("/admin/users/:id/ban", route(async (request, response) => {
    await requireElevated(request);
    response.json({ bannedUntil: await admin.ban(String(request.params.id), request.body?.days, request.body?.reason) });
  }));
  router.post("/admin/users/:id/warn", route(async (request, response) => {
    await requireElevated(request);
    response.json({ warning: await admin.warn(String(request.params.id), request.body?.reason) });
  }));
  router.delete("/admin/users/:id/warnings/:warningId", route(async (request, response) => {
    await requireElevated(request);
    await admin.removeWarning(String(request.params.id), String(request.params.warningId));
    response.status(204).end();
  }));
  router.get("/admin/users", route(async (request, response) => {
    await requireElevated(request);
    response.json({ users: request.query.sanctioned === "1" ? await admin.sanctionedUsers() : await admin.searchUsers(request.query.q) });
  }));
  router.get("/admin/games", route(async (request, response) => {
    await requireElevated(request);
    response.json({ games: await admin.recentGames(request.query.before) });
  }));
  router.get("/admin/contact", route(async (request, response) => {
    await requireElevated(request);
    response.json({ messages: await admin.listContact() });
  }));
  router.post("/admin/contact/:id/read", route(async (request, response) => {
    await requireElevated(request);
    await admin.markContact(String(request.params.id), request.body?.read);
    response.status(204).end();
  }));

  router.use((_request, _response, next) => next(new ApiError(404, "not_found")));

  router.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: { code: error.code } });
      return;
    }
    if ((error as { type?: string }).type === "entity.parse.failed" || (error as { type?: string }).type === "entity.too.large") {
      response.status(400).json({ error: { code: "invalid_input" } });
      return;
    }
    log.error("api request failed", { path: request.path, error });
    response.status(503).json({ error: { code: "unavailable" } });
  });

  return router;
}
