-- ============================================================
--  心愿单共享存储：Supabase 建表脚本
--  在 Supabase 后台 → SQL Editor → 粘贴全部内容 → Run 一次即可
-- ============================================================

-- 单行表：id=1 这一行的 items 字段存全部心愿（JSON 数组）
create table if not exists wishlist_state (
  id    int  primary key,
  items jsonb not null default '[]'::jsonb
);

-- 初始化一行
insert into wishlist_state (id, items) values (1, '[]'::jsonb)
on conflict (id) do nothing;

-- 开放读写（无登录的共享清单：anon key 本身即公开，安全性靠网址保密）
alter table wishlist_state enable row level security;
drop policy if exists "public_all" on wishlist_state;
create policy "public_all" on wishlist_state
  for all using (true) with check (true);
