import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CtaSection } from '@/components/CtaSection';
import { Prose } from '@/components/Prose';
import { seoSection, verticalIntro } from '@/lib/content';
import { isPublished, publishedVerticals, verticalName, visibleDemos, visibleVerticals } from '@/lib/site';

/**
 * SEO σελίδα κλάδου: εισαγωγή + μία ενότητα ανά demo του κλάδου, με link στο demo.
 * Υπάρχει μόνο για κλάδους με ορατά demos. Χωρίς σελίδες ανά πόλη με αλλαγμένο μόνο το όνομα (scaled content).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  // Next χρειάζεται τουλάχιστον μία τιμή για στατικές σελίδες· χωρίς κλάδους δίνουμε placeholder που κάνει 404.
  const list = visibleVerticals().filter((v) => verticalIntro(v));
  return list.length ? list.map((klados) => ({ klados })) : [{ klados: '_none' }];
}

export async function generateMetadata(props: PageProps<'/lyseis/[klados]'>): Promise<Metadata> {
  const { klados } = await props.params;
  const intro = verticalIntro(klados);
  if (!intro) return {};
  return {
    title: intro.data.title ?? verticalName(klados),
    description: intro.data.description,
    alternates: { canonical: `/lyseis/${klados}` },
    robots: publishedVerticals().includes(klados) ? undefined : { index: false, follow: false },
  };
}

export default async function VerticalPage(props: PageProps<'/lyseis/[klados]'>) {
  const { klados } = await props.params;
  const intro = verticalIntro(klados);
  const demos = visibleDemos().filter((d) => d.vertical === klados);
  if (!intro || demos.length === 0) notFound();

  return (
    <div className="container" data-testid="vertical-page">
      <nav className="small" style={{ paddingTop: 12 }}>
        <Link href="/">← Όλα τα demos</Link>
      </nav>
      <section>
        <Prose html={intro.html} testId="vertical-intro" />
      </section>
      {demos.map((d) => {
        const section = seoSection(klados, d.slug);
        return (
          <section key={d.slug} className="stack" data-testid="vertical-section">
            {section && <Prose html={section.html} />}
            <Link href={`/demos/${d.slug}`} className="btn btn-secondary btn-block">
              Δοκίμασε το demo: {d.title} ({d.duration})
            </Link>
            {!isPublished(d.slug) && <span className="badge-draft">Πρόχειρο</span>}
          </section>
        );
      })}
      <section>
        <CtaSection compact heading={`Θες να δούμε τι θα έκανε ένας agent στη δική σου επιχείρηση;`} />
      </section>
    </div>
  );
}
