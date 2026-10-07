-- Additive INSERT guard: never rewrites historical orders or their notifications.
-- Filename reconciled with the provider-assigned migration ledger after application.
-- Product UUIDs are the two verified live AM/PM variant identities (2026-10-07).
-- The prior colour-aware frontend remains compatible: color_code is optional.
set local lock_timeout = '3s';

create function ampm_notification_internal.require_order_colors()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  expected_color text;
  expected_code text;
  products_count integer := 0;
  delivery_count integer := 0;
begin
  if jsonb_typeof(new.items) is distinct from 'array' then
    raise exception 'Сойзны өнгө, тоог сонгоод захиалгаа дахин илгээнэ үү.' using errcode = '23514';
  end if;
  if jsonb_array_length(new.items) < 2 or jsonb_array_length(new.items) > 200 then
    raise exception 'Сойзны өнгө, тоог сонгоод захиалгаа дахин илгээнэ үү.' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'qty') is distinct from 'number'
      or coalesce(item->>'qty', '') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'Сойзны тоог 1–1000 хүртэл бүхэл тоогоор оруулна уу.' using errcode = '23514';
    end if;
    if (item->>'qty')::integer > 1000 then
      raise exception 'Сойзны тоог 1–1000 хүртэл бүхэл тоогоор оруулна уу.' using errcode = '23514';
    end if;
    if item->>'kind' = 'delivery' or item->>'name' = 'Хүргэлтийн төлбөр' then
      if item->>'name' is distinct from 'Хүргэлтийн төлбөр'
        or item->>'kind' is distinct from 'delivery'
        or item->>'qty' is distinct from '1' or item->>'price' is distinct from '6000'
        or item ? 'product_id' then
        raise exception 'Хүргэлтийн төлбөрийн мөр буруу байна.' using errcode = '23514';
      end if;
      delivery_count := delivery_count + 1;
      continue;
    end if;

    case item->>'product_id'
      when '75680028-c0e1-4876-ad88-0b81948da106' then
        expected_color := 'Мөнгөлөг'; expected_code := 'silver';
      when '74cca1c1-1d6c-4452-ac84-e3ede6c66e05' then
        expected_color := 'Ягаан алт'; expected_code := 'rose_gold';
      else
        raise exception 'Хуудсаа шинэчлээд сойзны өнгөө дахин сонгоно уу.' using errcode = '23514';
    end case;
    if item->>'color' is distinct from expected_color
      or (item ? 'color_code' and item->>'color_code' is distinct from expected_code)
      or item->>'kind' is distinct from 'product' then
      raise exception 'Сойзны код, өнгө таарахгүй байна. Хуудсаа шинэчлээд өнгөө дахин сонгоно уу.' using errcode = '23514';
    end if;
    products_count := products_count + 1;
  end loop;
  if products_count < 1 or delivery_count <> 1 then
    raise exception 'Сойз болон хүргэлтийн мэдээллийг дахин шалгана уу.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function ampm_notification_internal.require_order_colors() from public, anon, authenticated;
create trigger ampm_require_order_colors before insert on public.orders
for each row execute function ampm_notification_internal.require_order_colors();
