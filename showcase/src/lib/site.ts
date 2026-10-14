import published from '../../content/published.json';
import catalog from '@/demos/catalog.generated.json';
import { DEMOS } from '@/demos/registry.generated';
import type { DemoConfig } from './demo-types';

/** Link για τον «Χάρτη AI» (Cal.com). Το ορίζουν οι ιδρυτές στο Vercel: NEXT_PUBLIC_BOOKING_URL. */
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL || '/#xartis-ai';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const CTA_LABEL = 'Κλείσε τον Χάρτη AI';

/**
 * Δημοσιευμένα demos: όσα πέρασαν το Gate 3. Τη λίστα (content/published.json) τη γράφει ο orchestrator.
 * Με SHOWCASE_SHOW_DRAFTS=1 (preview, tests) φαίνονται και τα πρόχειρα, σημαδεμένα ως «Πρόχειρο».
 */
const PUBLISHED = new Set<string>(published as string[]);
export const SHOW_DRAFTS = process.env.SHOWCASE_SHOW_DRAFTS === '1';

export const isPublished = (slug: string): boolean => PUBLISHED.has(slug);

export function allDemos(): DemoConfig[] {
  return DEMOS;
}

export function visibleDemos(): DemoConfig[] {
  return DEMOS.filter((d) => isPublished(d.slug) || SHOW_DRAFTS);
}

export function demoBySlug(slug: string): DemoConfig | undefined {
  return DEMOS.find((d) => d.slug === slug);
}

export function verticalName(id: string): string {
  return catalog.verticals.find((v) => v.id === id)?.name ?? id;
}

export function serviceName(id: string): string {
  return catalog.services.find((s) => s.id === id)?.name ?? id;
}

export const VERTICALS = catalog.verticals;
export const SERVICES = catalog.services;
