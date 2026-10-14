import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoShell } from '@/components/demo/DemoShell';
import { EXAMPLES } from '@/components/demo/examples';
import { SHOW_DRAFTS } from '@/lib/site';

export const metadata: Metadata = { title: 'Κοινά components', robots: { index: false, follow: false } };

/**
 * Κατάλογος κοινών components με παραδείγματα, για ανάπτυξη και tests.
 * Υπάρχει μόνο με SHOWCASE_SHOW_DRAFTS=1 (ποτέ στο δημόσιο site).
 */
export default function ComponentsPage() {
  if (!SHOW_DRAFTS) notFound();
  return (
    <div className="container">
      {EXAMPLES.map((d) => (
        <section key={d.slug} id={d.slug}>
          <DemoShell demo={d} draft />
        </section>
      ))}
    </div>
  );
}
