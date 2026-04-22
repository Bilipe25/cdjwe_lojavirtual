alter table public.products
add column if not exists commercial_code text;

create index if not exists idx_products_commercial_code
on public.products (commercial_code);
