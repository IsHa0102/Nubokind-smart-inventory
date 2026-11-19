-- Partial deliveries on purchase orders (19 Nov 2026).
--
-- Almost every order arrives in parts: 500 ordered, 200 this week, 300 later.
-- Before this, "Received" added the whole quantity at once, so a part delivery
-- either waited (stock read low) or was marked received early (stock read high
-- and the rest vanished from "on order").
--
-- Model:
--   purchase_orders.quantity_received  running total of what has landed
--   purchase_order_receipts            one row per delivery: how many, which day
--   status                             unchanged set: ordered / in_transit / received.
--                                      An order is part-received when
--                                      0 < quantity_received < quantity_ordered and
--                                      status is still open. It becomes 'received'
--                                      when the total reaches the order, or when
--                                      someone closes it short ("supplier won't send
--                                      the rest") — then received < ordered on a
--                                      closed order, which is how "closed short" reads.
--
-- Still open = quantity_ordered - quantity_received, on ordered/in_transit rows.
-- The dashboard's /manufacturing nets exactly that (lib/planning.ts).
--
-- Every delivery goes through receive_purchase_order(), which records the
-- receipt, moves the total and adds the stock in ONE transaction. Split into
-- separate client calls, a failure between them leaves stock added with no
-- receipt (or the reverse), and the PO's "still open" figure stops matching the
-- shelf.

alter table purchase_orders
  add column if not exists quantity_received integer not null default 0
    check (quantity_received >= 0);

-- Orders already marked received before this column existed received everything.
update purchase_orders
   set quantity_received = quantity_ordered
 where status = 'received' and quantity_received = 0;

create table if not exists purchase_order_receipts (
  id                 bigserial primary key,
  purchase_order_id  bigint not null references purchase_orders(id) on delete restrict,
  quantity           integer not null check (quantity > 0),
  received_on        date not null default current_date,
  notes              text,
  warehouse_entry_id bigint,           -- the warehouse_entries row that added the stock
  created_at         timestamptz not null default now()
);

create index if not exists purchase_order_receipts_po_idx
  on purchase_order_receipts(purchase_order_id);

alter table purchase_order_receipts enable row level security;
drop policy if exists "authenticated_read" on purchase_order_receipts;
create policy "authenticated_read" on purchase_order_receipts
  for select to authenticated using (true);

-- Record one delivery against a PO and add it to warehouse stock.
--   p_quantity  units that arrived (> 0), or 0 together with p_close to close
--               an order short without a delivery
--   p_close     true = the supplier will send nothing more; the order closes
--               whatever has arrived
-- More than the remaining quantity is accepted (suppliers over-ship) and closes
-- the order; the stock added is what physically arrived.
create or replace function receive_purchase_order(
  p_order_id    bigint,
  p_quantity    integer,
  p_received_on date    default null,
  p_notes       text    default null,
  p_close       boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  po        purchase_orders%rowtype;
  entry     jsonb;
  entry_id  bigint;
  new_total integer;
  new_status text;
  on_day    date := coalesce(p_received_on, current_date);
begin
  select * into po from purchase_orders where id = p_order_id for update;
  if not found then raise exception 'Purchase order % not found.', p_order_id; end if;
  if po.status = 'received' then
    raise exception 'Purchase order % is already closed.', p_order_id;
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity must be zero or more.';
  end if;
  if p_quantity = 0 and not p_close then
    raise exception 'Enter the units that arrived.';
  end if;
  if on_day > current_date then
    raise exception 'Received date cannot be in the future.';
  end if;

  if p_quantity > 0 then
    entry := warehouse_single_entry(
      po.product_id::integer, 'add', p_quantity, 'Purchase Order', null,
      format('PO #%s: %s received (%s of %s so far)', po.id, p_quantity,
             po.quantity_received + p_quantity, po.quantity_ordered),
      to_char(on_day, 'YYYY-MM-DD'), '{}'::text[]);
    entry_id := (entry->>'id')::bigint;

    insert into purchase_order_receipts
      (purchase_order_id, quantity, received_on, notes, warehouse_entry_id)
    values (po.id, p_quantity, on_day, p_notes, entry_id);
  end if;

  new_total  := po.quantity_received + p_quantity;
  new_status := case when p_close or new_total >= po.quantity_ordered
                     then 'received' else po.status end;

  update purchase_orders
     set quantity_received = new_total,
         status            = new_status,
         updated_at        = now()
   where id = po.id;

  return jsonb_build_object(
    'id', po.id, 'quantity_ordered', po.quantity_ordered,
    'quantity_received', new_total, 'status', new_status,
    'remaining', greatest(po.quantity_ordered - new_total, 0));
end $$;

-- Functions default to EXECUTE for PUBLIC; this one writes stock.
revoke all on function receive_purchase_order(bigint, integer, date, text, boolean) from public, anon, authenticated;
grant execute on function receive_purchase_order(bigint, integer, date, text, boolean) to service_role;
