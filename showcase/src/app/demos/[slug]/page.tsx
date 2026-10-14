import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DemoShell } from '@/components/demo/DemoShell';
import { allDemos, demoBySlug, isPublished } from '@/lib/site';

// Κάθε demo στο registry γίνεται στατική σελίδα. Άγνωστο slug → 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return allDemos().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata(props: PageProps<'/demos/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const demo = demoBySlug(slug);
  if (!demo) return {};
  return {
    title: demo.title,
    description: demo.tagline,
    alternates: { canonical: `/demos/${slug}` },
    // Πρόχειρα demos (πριν το Gate 3) είναι προσβάσιμα για έλεγχο αλλά όχι για Google.
    robots: isPublished(slug) ? undefined : { index: false, follow: false },
  };
}

export default async function DemoPage(props: PageProps<'/demos/[slug]'>) {
  const { slug } = await props.params;
  const demo = demoBySlug(slug);
  if (!demo) notFound();
  return (
    <div className="container">
      <nav className="small" style={{ paddingTop: 12 }}>
        <Link href="/">← Όλα τα demos</Link>
      </nav>
      <DemoShell demo={demo} draft={!isPublished(slug)} />
    </div>
  );
}
