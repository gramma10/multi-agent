import type { MetadataRoute } from 'next';
import { allDemos, isPublished, SITE_URL } from '@/lib/site';

/** Μόνο δημοσιευμένα demos (μετά το Gate 3). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    ...allDemos()
      .filter((d) => isPublished(d.slug))
      .map((d) => ({ url: `${SITE_URL}/demos/${d.slug}`, changeFrequency: 'monthly' as const, priority: 0.8 })),
  ];
}
