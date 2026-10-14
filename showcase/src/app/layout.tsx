import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { CtaSection } from '@/components/CtaSection';
import { BOOKING_URL, CTA_LABEL, SITE_URL } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Auragram Demos: δες έναν AI agent να δουλεύει στη δουλειά σου',
    template: '%s · Auragram Demos',
  },
  description:
    'Δουλεμένα demos με ενδεικτικά δεδομένα: πώς ένας AI agent απαντά, κλείνει ραντεβού και σου γλιτώνει ώρες. Κλείσε δωρεάν τον Χάρτη AI.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fbfaf8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              Auragram <span className="muted">· Demos</span>
            </Link>
            <a className="btn btn-primary" href={BOOKING_URL} data-cta="header">
              {CTA_LABEL}
            </a>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container stack">
            <CtaSection />
            <p>
              Τα demos σε αυτή τη σελίδα είναι <strong>concepts με ενδεικτικά δεδομένα</strong>. Δεν είναι έργα
              πελατών και οι επιχειρήσεις μέσα τους είναι φανταστικές.
            </p>
            <p>© Auragram</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
