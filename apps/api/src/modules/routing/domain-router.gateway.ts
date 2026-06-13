import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

/**
 * Domain Router Gateway — Resolves tenant from incoming request.
 *
 * Feature: nginx-wildcard-headers + tenant-host-resolution
 *
 * Resolution order (first match wins):
 * 1. x-tenant-slug header (explicit — used in dev/API calls)
 * 2. Host header subdomain: {slug}.vspro.mx → slug
 * 3. X-Forwarded-Host (behind nginx/ALB): {slug}.vspro.mx
 * 4. Custom domain lookup (future: tenant.customDomain)
 *
 * Caches resolved tenants in memory (LRU, 5 min TTL).
 * Zero-waste: no external deps, pure logic.
 */
@Injectable()
export class DomainRouterGateway {
  private readonly logger = new Logger(DomainRouterGateway.name);
  private readonly baseDomain: string;
  private readonly cache = new Map<string, { tenant: ResolvedTenant; expiresAt: number }>();
  private readonly CACHE_TTL = 300_000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.baseDomain = this.config.get('APP_DOMAIN', 'vspro.mx');
  }

  /**
   * Resolve tenant from request headers.
   * Returns null if no valid tenant found.
   */
  async resolve(headers: Record<string, string | string[] | undefined>): Promise<ResolvedTenant | null> {
    // 1. Explicit header (highest priority)
    const explicitSlug = this.getHeader(headers, 'x-tenant-slug');
    if (explicitSlug) return this.lookupBySlug(explicitSlug);

    // 2. Host header subdomain
    const host = this.getHeader(headers, 'host');
    if (host) {
      const slug = this.extractSubdomain(host);
      if (slug) return this.lookupBySlug(slug);
    }

    // 3. X-Forwarded-Host (behind proxy/nginx)
    const forwarded = this.getHeader(headers, 'x-forwarded-host');
    if (forwarded) {
      const slug = this.extractSubdomain(forwarded);
      if (slug) return this.lookupBySlug(slug);
    }

    // 4. Origin header (CORS context)
    const origin = this.getHeader(headers, 'origin');
    if (origin) {
      try {
        const url = new URL(origin);
        const slug = this.extractSubdomain(url.hostname);
        if (slug) return this.lookupBySlug(slug);
      } catch { /* invalid origin */ }
    }

    return null;
  }

  /**
   * Lookup tenant by slug with cache.
   */
  async lookupBySlug(slug: string): Promise<ResolvedTenant | null> {
    // Check cache
    const cached = this.cache.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tenant;
    }

    // DB lookup
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, schemaName: true, status: true, businessName: true },
    });

    if (!tenant) return null;

    const resolved: ResolvedTenant = {
      id: tenant.id,
      slug: tenant.slug,
      schemaName: tenant.schemaName,
      status: tenant.status,
      businessName: tenant.businessName,
    };

    // Cache it
    this.cache.set(slug, { tenant: resolved, expiresAt: Date.now() + this.CACHE_TTL });

    // Evict old entries (simple LRU — keep max 100)
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    return resolved;
  }

  /**
   * Invalidate cache for a tenant (after update/suspend).
   */
  invalidate(slug: string): void {
    this.cache.delete(slug);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private extractSubdomain(host: string): string | null {
    // Remove port if present
    const hostname = host.split(':')[0];

    // Check if it matches *.baseDomain
    if (hostname.endsWith(`.${this.baseDomain}`)) {
      const subdomain = hostname.replace(`.${this.baseDomain}`, '');
      if (subdomain && !subdomain.includes('.') && subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'app') {
        return subdomain;
      }
    }

    // Check localhost patterns: {slug}.localhost
    if (hostname.endsWith('.localhost')) {
      return hostname.replace('.localhost', '');
    }

    return null;
  }

  private getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | null {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (!value) return null;
    return Array.isArray(value) ? value[0] : value;
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface ResolvedTenant {
  id: string;
  slug: string;
  schemaName: string;
  status: string;
  businessName: string;
}
