-- Supabase schema for Orderly
-- Users, Products, Orders, Order Items, Inventory Movements

-- Enable required extensions (usually enabled by default in Supabase)
create extension if not exists pgcrypto;

-- Users
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text check (role in ('shopkeeper','wholesaler','distributor','admin')),
  organization_name text,
  name text,
  phone text,
  address text,
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_users_email on users(lower(email));

-- Products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  description text,
  price numeric(12,2) not null default 0,
  stock integer not null default 0,
  images jsonb,
  owner_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_products_owner on products(owner_user_id);
create index if not exists idx_products_name on products using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')));

-- Orders
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('pending','confirmed','accepted','placed','out_for_delivery','delivered','cancelled')) default 'pending',
  total numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_orders_status on orders(status);

-- Order Items
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0
);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_order_items_product on order_items(product_id);

-- Inventory Movements (delta based)
create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  change integer not null, -- positive or negative adjustments
  reason text, -- e.g., 'order', 'restock', 'manual_adjustment'
  order_id uuid references orders(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_inventory_movements_product on inventory_movements(product_id);

-- Optional: Order status history
create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  note text,
  changed_by uuid references users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists idx_order_status_history_order on order_status_history(order_id);

-- Policies (RLS) - disabled for now since backend uses service role
alter table users enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table inventory_movements enable row level security;
alter table order_status_history enable row level security;

-- Minimal permissive policies for service-role operations; anon has no access by default
-- You can refine later if you plan to access directly from frontend without backend
create policy if not exists service_all_users on users for all using (true) with check (true);
create policy if not exists service_all_products on products for all using (true) with check (true);
create policy if not exists service_all_orders on orders for all using (true) with check (true);
create policy if not exists service_all_order_items on order_items for all using (true) with check (true);
create policy if not exists service_all_inventory on inventory_movements for all using (true) with check (true);
create policy if not exists service_all_status_hist on order_status_history for all using (true) with check (true);
