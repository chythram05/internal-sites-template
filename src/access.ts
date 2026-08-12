/**
 * Cloudflare Access identity helpers, JWT verification, and routing mode detection.
 *
 * Auth model:
 *   - localhost / 127.x  → local dev bypass (placeholder identity, no JWT needed)
 *   - Everywhere else    → verify the Cf-Access-Jwt-Assertion JWT using
 *                          Cloudflare's published JWKS. Requires ACCESS_TEAM_DOMAIN
 *                          and ACCESS_AUD to be configured.
 *
 * Routing mode (separate from auth) is auto-detected:
 *   - workers.dev / localhost / placeholder domain → path-based routing (/sites/slug/)
 *   - Real custom domain                          → subdomain routing (slug.company.com)
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";

export interface AccessIdentity {
	email: string;
	userId?: string;
}

const JWT_HEADER = "Cf-Access-Jwt-Assertion";
const DEFAULT_PLACEHOLDER_DOMAIN = "internal-company.com";

// ── Local dev detection ──────────────────────────────────────────────────────

/**
 * Returns true only when the Worker is running on localhost (wrangler dev).
 * This is the ONLY environment where auth is bypassed.
 */
export function isLocalDev(request: Request): boolean {
	const hostname = new URL(request.url).hostname;
	return hostname === "localhost" || hostname.startsWith("127.");
}

// ── Routing mode detection ───────────────────────────────────────────────────

/**
 * Detect whether path-based routing should be used.
 *
 * Path-based routing is active when:
 *   - The request hostname ends with `.workers.dev`
 *   - The request hostname is `localhost` (wrangler dev)
 *   - SITE_DOMAIN is empty or still the default placeholder
 *
 * This is separate from auth — workers.dev uses path-based routing but
 * still requires JWT verification for platform routes.
 */
export function isTestingMode(request: Request, env: Env): boolean {
	const hostname = new URL(request.url).hostname;
	const domain = (env.SITE_DOMAIN || "").trim();

	return (
		hostname.endsWith(".workers.dev") ||
		hostname === "localhost" ||
		hostname.startsWith("127.") ||
		domain === "" ||
		domain === DEFAULT_PLACEHOLDER_DOMAIN
	);
}

// ── JWT verification ─────────────────────────────────────────────────────────

/**
 * Module-level JWKS cache. jose's createRemoteJWKSet handles key
 * rotation and caching internally, but we reuse the same instance
 * as long as the team domain hasn't changed.
 */
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedTeamDomain: string | null = null;

function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
	if (cachedJwks && cachedTeamDomain === teamDomain) {
		return cachedJwks;
	}
	cachedJwks = createRemoteJWKSet(
		new URL(`${teamDomain}/cdn-cgi/access/certs`),
	);
	cachedTeamDomain = teamDomain;
	return cachedJwks;
}

/** Reset the JWKS cache (used by tests to ensure clean state). */
export function resetJwksCache(): void {
	cachedJwks = null;
	cachedTeamDomain = null;
}

/**
 * Verify the Cloudflare Access JWT from the request.
 *
 * Uses jose's createRemoteJWKSet to fetch and cache public keys from
 * the team's JWKS endpoint. Keys are cached internally by jose and
 * rotated automatically.
 */
async function verifyAccessJwt(
	request: Request,
	env: Env,
): Promise<AccessIdentity> {
	const token = request.headers.get(JWT_HEADER);
	if (!token) {
		throw new Error("Missing Cf-Access-Jwt-Assertion header");
	}

	const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN || "");
	const jwks = getJwks(teamDomain);

	const { payload } = await jwtVerify(token, jwks, {
		issuer: teamDomain,
		audience: env.ACCESS_AUD,
	});

	const email = payload.email as string | undefined;
	if (!email) {
		throw new Error("JWT payload missing email claim");
	}

	return {
		email,
		userId: (payload.sub as string) || undefined,
	};
}

/**
 * Ensure the team domain has an https:// prefix and no trailing slash.
 */
function normalizeTeamDomain(domain: string): string {
	let normalized = domain.trim();
	if (!normalized.startsWith("https://") && !normalized.startsWith("http://")) {
		normalized = `https://${normalized}`;
	}
	return normalized.replace(/\/+$/, "");
}

// ── Public auth API ──────────────────────────────────────────────────────────

/**
 * Extract the verified identity from the request.
 *
 * - localhost: returns a placeholder identity (local dev bypass)
 * - Everywhere else: verifies the Access JWT
 *
 * Returns null if identity could not be established.
 */
export async function getAccessIdentity(
	request: Request,
	env: Env,
): Promise<AccessIdentity | null> {
	// Local dev: allow access with a placeholder identity
	if (isLocalDev(request)) {
		return { email: "local-dev@localhost" };
	}

	// JWT verification requires both env vars
	if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
		return null;
	}

	try {
		return await verifyAccessJwt(request, env);
	} catch {
		return null;
	}
}

/**
 * Require a verified identity. Returns the identity or a 401 Response.
 *
 * - localhost: returns a placeholder identity (no JWT needed)
 * - Everywhere else with ACCESS_TEAM_DOMAIN + ACCESS_AUD set: verifies JWT
 * - Everywhere else without those vars: returns 401 with configuration help
 */
export async function requireAccessIdentity(
	request: Request,
	env: Env,
): Promise<AccessIdentity | Response> {
	// Local dev: always allow
	if (isLocalDev(request)) {
		return { email: "local-dev@localhost" };
	}

	// If Access verification is not configured, tell the user how to fix it
	if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
		return new Response(
			"Access verification is not configured.\n\n" +
				"Set ACCESS_TEAM_DOMAIN and ACCESS_AUD as environment variables.\n" +
				"See the README for setup instructions.",
			{
				status: 401,
				headers: { "Content-Type": "text/plain; charset=utf-8" },
			},
		);
	}

	try {
		return await verifyAccessJwt(request, env);
	} catch (error) {
		const detail = error instanceof Error ? error.message : "Unknown error";
		return new Response(
			"Company sign-in is required.\n\n" +
				`Cloudflare Access token is missing or invalid: ${detail}`,
			{
				status: 401,
				headers: { "Content-Type": "text/plain; charset=utf-8" },
			},
		);
	}
}
