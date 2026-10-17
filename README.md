# 高校物理Wiki

高校物理（物理基礎・物理）の解説Wikiです。トピックごとの執筆状況（未着手／執筆中／完成）を記録し、進捗を一覧で確認できます。

## 起動

```
npm start
```

ブラウザで http://localhost:3000 を開きます（Node.js 18 以上。外部パッケージは不要）。
ポートを変えるときは `PORT=8080 npm start`（PowerShell では `$env:PORT=8080; npm start`）。

## 公開（GitHub Pages）

公開URL：https://githubtarohario.github.io/phywiki/

`main` ブランチに push すると、GitHub Actions（`.github/workflows/pages.yml`）が `public/` と `data/` を公開します。
公開版は **閲覧専用** です（編集ボタンは表示されません）。記事の編集は手元で `npm start` して行い、次のように反映します。

```
git add data
git commit -m "記事を更新"
git push
```

## 使い方

- トップページ：分野ごとの進捗バーと、全トピックの状態を表示
- 記事ページ：「編集」ボタンで編集画面へ
- 編集画面：左が Markdown、右がプレビュー。状態を選んで「保存」（Ctrl+S でも保存）
  - 数式：文中は `$F = ma$`、別行は `$$ ... $$`（KaTeX で表示）
  - 他の記事へのリンク：`[加速度](#/page/acceleration)`

## ファイル構成

```
server.js              サーバー（静的ファイル配信 + API）
public/                画面（index.html / style.css / app.js）
data/curriculum.json   科目 → 分野 → トピック の一覧（ここを編集すると単元を増減できる）
data/progress.json     トピックごとの状態と更新日時
data/pages/<id>.md     記事本文（Markdown）
```

データはすべてテキストファイルなので、Git で管理すれば変更履歴も残せます。

## API

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/curriculum` | カリキュラムと進捗 |
| GET | `/api/pages/:id` | 記事本文・状態 |
| PUT | `/api/pages/:id` | `{ content, status }` で保存（status は `todo` / `draft` / `done`） |

## 今後：問題集の追加方針

トピック ID（`uniform-acceleration` など）を共通キーにして、問題を別ファイルで管理する想定です。

```
data/problems/<problemId>.json
{
  "id": "p0001",
  "title": "斜面を滑る物体",
  "topics": ["uniform-acceleration", "friction"],
  "difficulty": 2,
  "question": "（Markdown + 数式）",
  "answer": "…",
  "solution": "…",
  "source": "オリジナル"
}
```

これに `/api/problems` を追加すると、記事ページに「関連する問題」を表示したり、トピックごとの問題数を進捗に含めたりできます。
