alter table public.songs
  add column genre text
  check (genre in ('nostalgia', 'ai', 'tiktok', 'sentimental', 'chill'));
