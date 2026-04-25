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
2. `supabase/migrations/001_reservations.sql` を適用します。
3. Edge Functions をデプロイします。

```bash
supabase functions deploy createReservation
supabase functions deploy adminListReservations
supabase functions deploy adminUpdateReservationStatus
```

4. 管理者パスワードを secret に設定します。

```bash
supabase secrets set ADMIN_PASSWORD="your-booth-password"
```

`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は Supabase Functions 環境で自動的に利用されます。

## GitHub Pages

GitHub repository secrets に以下を設定します。

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

必要に応じて repository variables に以下を設定します。

- `SITE_URL`: `https://your-user.github.io`
- `BASE_PATH`: `/your-repository-name`

`main` ブランチへ push すると GitHub Pages にデプロイされます。

## 注意

ブラウザからスマートフォンの物理IDは取得できません。この実装では、初回アクセス時に生成したランダムな端末IDを `localStorage` に保存し、同じブラウザでの重複予約を防ぎます。
