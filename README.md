# 100 DAYS Challenge

今年の「やりたい」を、
毎日の小さな行動で「できた」に変える
100日チャレンジカレンダーです。

## 主な機能

- 今年中に叶えたいゴールを1つ設定
- 今日やることを1つだけ設定
- 完了記録
- 毎日1つの問いへの回答
- カレンダーから記録を確認・編集（未来の日付は閲覧のみ）
- localStorageによるブラウザ保存

## 使用技術

- HTML
- CSS
- Vanilla JavaScript
- localStorage

フレームワーク・サーバーは使用していません。フォントは Google Fonts から読み込みます（読み込めない場合は端末のフォントで表示されます）。

## 起動方法

`index.html` をブラウザで開くだけで動きます。

## データ保存について

データはブラウザのlocalStorage（キー：`hundredDaysChallenge`）に保存されます。

ブラウザデータを削除した場合や、
別の端末・ブラウザではデータは引き継がれません。
ローカルで開いたときの記録と、公開URLで開いたときの記録も別になります。

## GitHub Pages

GitHub Pagesで公開可能です。

1. リポジトリの **Settings → Pages** を開く
2. Source を「Deploy from a branch」にする
3. Branch を `main`、フォルダを `/ (root)` にして Save
4. `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます
