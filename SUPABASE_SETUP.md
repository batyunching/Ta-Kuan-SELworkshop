# Supabase 設定說明

本網站目前可以先用本機暫存預覽操作流程。若要讓老師在不同裝置或重新登入後都能保留資料，請設定 Supabase。

目前專案已設定：

- Project URL：`https://tiscxqwpsnykiqztrywk.supabase.co`
- Publishable key：已填入 `supabase-config.js`

請勿將 Supabase Database password 寫入 README、設定說明或任何會上傳 GitHub 的檔案。Database password 只用於 Supabase 後台或資料庫管理，前端網頁不需要使用它。

## 一、建立 Supabase 專案

1. 進入 Supabase 並建立新專案。
2. 建立一個 Storage bucket，名稱建議使用：

```text
sel-submissions
```

3. 將 bucket 設為 public，讓成果發表區可以顯示圖片或開啟檔案連結。

## 二、建立資料表

在 Supabase SQL Editor 執行以下 SQL：

```sql
create table if not exists public.sel_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  identity text not null,
  user_name text not null,
  session_code text,
  category text not null check (category in ('mentor', 'thermometer')),
  title text not null,
  description text,
  status text not null check (status in ('draft', 'published')),
  file_name text,
  file_type text,
  file_size bigint,
  file_path text,
  file_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sel_submissions enable row level security;

create policy "sel_submissions_select"
on public.sel_submissions
for select
using (true);

create policy "sel_submissions_insert"
on public.sel_submissions
for insert
with check (true);

create policy "sel_submissions_update"
on public.sel_submissions
for update
using (true)
with check (true);

create policy "sel_submissions_delete"
on public.sel_submissions
for delete
using (true);
```

## 三、設定 Storage 權限

若使用 public bucket，請在 Supabase SQL Editor 執行：

```sql
create policy "sel_storage_select"
on storage.objects
for select
using (bucket_id = 'sel-submissions');

create policy "sel_storage_insert"
on storage.objects
for insert
with check (bucket_id = 'sel-submissions');

create policy "sel_storage_update"
on storage.objects
for update
using (bucket_id = 'sel-submissions')
with check (bucket_id = 'sel-submissions');

create policy "sel_storage_delete"
on storage.objects
for delete
using (bucket_id = 'sel-submissions');
```

### Storage 權限修復 SQL

若文字資料可以儲存，但只要附加檔案就出現「儲存失敗」，通常代表 Storage bucket 權限或檔案限制沒有設定完整。可在 Supabase SQL Editor 執行以下 SQL，重新建立 Storage 權限：

```sql
drop policy if exists "sel_storage_select" on storage.objects;
drop policy if exists "sel_storage_insert" on storage.objects;
drop policy if exists "sel_storage_update" on storage.objects;
drop policy if exists "sel_storage_delete" on storage.objects;

create policy "sel_storage_select"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'sel-submissions');

create policy "sel_storage_insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'sel-submissions');

create policy "sel_storage_update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'sel-submissions')
with check (bucket_id = 'sel-submissions');

create policy "sel_storage_delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'sel-submissions');
```

也請確認 `sel-submissions` bucket 是 Public，且檔案大小限制足以容納老師上傳的 PDF、Word 或 PowerPoint。

## 四、填入網站設定

打開 `supabase-config.js`，改成以下格式：

```javascript
window.SEL_SUPABASE_CONFIG = {
  enabled: true,
  url: "https://tiscxqwpsnykiqztrywk.supabase.co",
  anonKey: "你的 Publishable key 或 anon public key",
  table: "sel_submissions",
  bucket: "sel-submissions"
};
```

儲存後重新整理網頁，右上角會顯示「Supabase 雲端儲存」。

## 五、重要提醒

目前版本採用簡易研習用途設計，管理者密碼是在前端控制顯示與操作流程。若未來要長期公開使用，建議改成 Supabase Auth 或後端管理者驗證，避免未授權使用者直接操作資料。

Supabase Database password 屬於敏感密碼，請存放於私人密碼管理器或 Supabase 後台，不要放入 GitHub 專案檔案。
