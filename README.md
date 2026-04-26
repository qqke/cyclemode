# テストライド体験 予約システム

Astro + GitHub Pages + Supabase で動く展示会向けの試乗予約システムです。

## 機能

- 1ページで予約受付と管理者メニューを表示
- 16歳以上確認後に当日の受付番号を発行
- 同一ブラウザ端末は当日1回だけ予約可能
- 予約後に同じ端末で開くと自分の番号を再表示
- 管理者は固定パスワードで当日の予約一覧を確認
- 管理者は予約を `体験済み` に更新可能

## ローカル起動

```bash
npm install
cp .env.example .env
npm run dev
```

`.env` には Supabase の公開 URL と anon key を設定してください。

## Supabase セットアップ

1. Supabase プロジェクトを作成します。
2. `supabase/migrations` 配下の SQL を番号順に適用します。
3. 管理者パスワードを SQL で設定します。

```sql
update public.app_settings
   set value = extensions.crypt('your-booth-password', extensions.gen_salt('bf')),
       updated_at = now()
 where key = 'admin_password_hash';
```

Edge Functions は使用しません。予約作成、予約再表示、管理者一覧、ステータス更新は Supabase の SQL function を `rpc` で直接呼び出します。

## GitHub Pages

GitHub repository secrets に以下を設定します。

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

`SITE_URL` と `BASE_PATH` は GitHub Actions workflow 側で自動設定されます。

`main` ブランチへ push すると GitHub Pages にデプロイされます。

## 注意

ブラウザからスマートフォンの物理IDは取得できません。この実装では、初回アクセス時に生成したランダムな端末IDを `localStorage` に保存し、同じブラウザでの重複予約を防ぎます。
