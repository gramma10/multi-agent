import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DemoShell } from '@/components/demo/DemoShell';
import { Prose } from '@/components/Prose';
import { demoPage } from '@/lib/content';
import { allDemos, demoBySlug, isPublished, SHOW_DRAFTS } from '@/lib/site';

// Κάθε demo στο registry γίνεται στατική σελίδα. Άγνωστο slug → 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return allDemos().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata(props: PageProps<'/demos/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const demo = demoBySlug(slug);
  if (!demo) return {};
  const page = demoPage(slug);
  return {
    title: page?.data.title ?? demo.title,
    description: page?.data.description ?? demo.tagline,
    alternates: { canonical: `/demos/${slug}` },
    // Πρόχειρα demos (πριν το Gate 3) είναι προσβάσιμα για έλεγχο αλλά όχι για Google.
    robots: isPublished(slug) ? undefined : { index: false, follow: false },
  };
}

export default async function DemoPage(props: PageProps<'/demos/[slug]'>) {
  const { slug } = await props.params;
  const demo = demoBySlug(slug);
  if (!demo) notFound();
  const page = demoPage(slug);
  return (
    <div className="container">
      <nav className="small" style={{ paddingTop: 12 }}>
        <Link href="/">← Όλα τα demos</Link>
        {(isPublished(slug) || SHOW_DRAFTS) && (
          <>
            {' · '}
            <Link href={`/lyseis/${demo.vertical}`}>Όλα για τον κλάδο</Link>
          </>
        )}
      </nav>
      <DemoShell demo={demo} draft={!isPublished(slug)} />
      {page && (
        <section aria-label="Περισσότερα για αυτό το demo">
          <Prose html={page.html} testId="demo-page-content" />
        </section>
      )}
    </div>
  );
}
