import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container" style={{ padding: '48px 16px' }}>
      <h1>Δεν βρέθηκε αυτή η σελίδα.</h1>
      <p className="muted">Ίσως το demo δεν υπάρχει πια ή άλλαξε διεύθυνση.</p>
      <Link href="/" className="btn btn-secondary">
        Δες όλα τα demos
      </Link>
    </div>
  );
}
