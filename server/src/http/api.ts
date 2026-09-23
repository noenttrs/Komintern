import type { IncomingMessage } from "http";

import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import type { AdminService } from "../admin/service";
import { ApiError, accountView } from "../auth/accounts";
import type { User } from "../store/users";
import { SessionService } from "../auth/sessions";
import { log } from "../logger";
import type { Services } from "../services";

const SESSION_COOKIE = "sid";

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

export function createApi(services: Services, admin: AdminService): express.Router {
  const { accounts, sessions, config } = services;
  const router = express.Router();

  const setSessionCookie = (response: Response, id: string): void => {
    response.setHeader(
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
    response.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { httpOnly: true, secure: config.secureCookies, sameSite: "lax", path: "/", maxAge: 0 }));
  };
  const startSession = async (response: Response, user: User): Promise<void> => {
    setSessionCookie(response, await sessions.create(user.id));
    response.json({ user: accountView(user, true) });
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

  router.get("/config", (_request, response) => {
    response.json({
      googleEnabled: services.google !== undefined,
      emailDelivery: config.resendApiKey !== undefined,
      legal: config.legal,
      donationUrl: config.donationUrl,
    });
  });

  router.post("/auth/register", route(async (request, response) => {
    await accounts.register(request.body ?? {}, clientIp(request));
    response.status(202).json({ status: "code_sent" });
  }));

  router.post("/auth/resend", route(async (request, response) => {
    await accounts.resendVerification(request.body?.email);
    response.status(202).json({ status: "code_sent" });
  }));

  router.post("/auth/verify", route(async (request, response) => {
    await startSession(response, await accounts.verifyEmail(request.body?.email, request.body?.code));
  }));

  router.post("/auth/login", route(async (request, response) => {
    await startSession(response, await accounts.login(request.body ?? {}, clientIp(request)));
  }));

  router.post("/auth/logout", route(async (request, response) => {
    if (request.sessionId !== undefined) {
      await sessions.destroy(request.sessionId, request.userId);
    }
    clearSessionCookie(response);
    response.status(204).end();
  }));

  router.post("/auth/password/forgot", route(async (request, response) => {
    await accounts.requestPasswordReset(request.body?.email);
    response.status(202).json({ status: "code_sent" });
  }));

  router.post("/auth/password/reset", route(async (request, response) => {
    await startSession(response, await accounts.resetPassword(request.body ?? {}));
  }));

  router.get("/auth/google", route(async (_request, response) => {
    if (services.google === undefined) {
      throw new ApiError(404, "google_disabled");
    }
    response.redirect(302, await services.google.authorizationUrl());
  }));

  router.get("/auth/google/callback", async (request: AuthedRequest, response: Response) => {
    const back = (query: string): void => response.redirect(302, `${config.publicUrl}/${query}`);
    const { code, state, error } = request.query;
    if (services.google === undefined || typeof code !== "string" || typeof state !== "string" || error !== undefined) {
      back("?auth=error");
      return;
    }
    try {
      const user = await accounts.loginWithGoogle(await services.google.handleCallback(code, state));
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
    response.json({ bannedUntil: await admin.ban(String(request.params.id), request.body?.days) });
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
