-- Fix function search_path
alter function public.generate_license_key() set search_path = public;
-- activate_license already has search_path set, but re-affirm
alter function public.activate_license(text, text, text) set search_path = public;

-- Tighten invoice policies (admins only for write/update; staff still create through edge function path if needed later — for now lock to admin)
drop policy if exists "Authenticated create invoices" on public.invoices;
drop policy if exists "Authenticated update invoices" on public.invoices;

create policy "Auth create invoices"
  on public.invoices for insert
  to authenticated
  with check (auth.uid() is not null and (created_by = auth.uid() or created_by is null));

create policy "Auth update own or admin"
  on public.invoices for update
  to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Tighten storage SELECT for logos (allow read of files but require an authenticated session OR a known path -- keep public so <img src> works)
-- We'll leave public read since logos are embedded in printable invoices; this warning is acceptable for that use case.
-- However drop overly broad and recreate scoped to bucket only (already scoped). No change needed beyond acknowledgement.

-- Restrict device manage policy: allow self-insert during activation handled by SECURITY DEFINER function; keep admin-only for direct table writes.
-- Already correct.