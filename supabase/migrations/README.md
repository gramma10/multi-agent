# supabase/migrations/

Schema της βάσης για leads, καμπάνιες, events, suppression, συγκαταθέσεις.

- `20261014000001_leads.sql`: όλοι οι πίνακες, με **Row Level Security ενεργό παντού και χωρίς policies**. Ο anon ρόλος δεν βλέπει τίποτα· ο orchestrator μπαίνει με απευθείας σύνδεση (`SUPABASE_DB_URL`) που παρακάμπτει το RLS.

Εκτέλεση (μία φορά, από τους ιδρυτές):

```bash
supabase link --project-ref <ref>
supabase db push
```

ή επικόλληση του αρχείου στον SQL editor του Supabase.

Το ίδιο schema για SQLite (dry-run/τοπικά) είναι στο `orchestrator/src/leads/schema.ts`. Ένα test ελέγχει ότι έχουν ίδιους πίνακες και στήλες: αν αλλάξεις το ένα, άλλαξε και το άλλο.
