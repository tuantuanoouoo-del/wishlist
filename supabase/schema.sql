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

-- ============================================================
--  餐厅收藏：图片存储桶（公开读 + 匿名上传）
--  公开读：图片 URL 可直接在浏览器打开
--  匿名上传：与上面 wishlist_state 的开放策略一致（家庭自用）
-- ============================================================
insert into storage.buckets (id, name, public)
values ('wishlist-images', 'wishlist-images', true)
on conflict (id) do nothing;

drop policy if exists "wishlist_images_anon_insert" on storage.objects;
create policy "wishlist_images_anon_insert" on storage.objects
  for insert with check (bucket_id = 'wishlist-images');

drop policy if exists "wishlist_images_anon_delete" on storage.objects;
create policy "wishlist_images_anon_delete" on storage.objects
  for delete using (bucket_id = 'wishlist-images');
