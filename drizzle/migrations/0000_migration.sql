create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null,
  message jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.chat_messages(thread_id, created_at);
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
grant select, insert, update, delete on public.chat_threads, public.chat_messages to authenticated;
create policy "Own threads" on public.chat_threads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Own messages" on public.chat_messages for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));