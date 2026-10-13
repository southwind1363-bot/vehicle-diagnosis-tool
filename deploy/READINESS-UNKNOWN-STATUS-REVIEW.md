# レディネスの不明値と状態名の整合性：適用前レビュー

確認日: 2026-10-14。本体3.13.692は未変更。実機通信なし。

## 再現した問題

`normalizeReadinessSnapshot` は明示された不明値をsupported/completeのnullとして保持する一方、statusの補完では真偽値として扱うため、次の不一致が生じる。入力に状態名がない場合の問題であり、画面全体が必ず同じ誤表示になると確認したものではない。

| supported | complete | 現行の補完status | 修正案 |
| --- | --- | --- | --- |
| null | null/false/true | not_supported（非対応） | unknown（不明） |
| true | null | not_complete（未完了） | unknown（不明） |
| true | true | complete（完了） | 維持 |
| true | false | not_complete（未完了） | 維持 |
| false | null/false/true | not_supported（非対応） | 維持 |

## 修正範囲

隔離検証143項目と`git apply --check --ignore-space-change`が合格。実ブラウザーでの確認と本体への適用は未実施。

状態名を補完する1行だけを変更する案。値・取得状態・集計件数・通信権限・保存schemaは変更しない。入力に明示された状態名は優先するため、以前に保存された非対応/未完了という状態名は自動修復しない。両フィールドの欠落時に現行処理が補う既定値も今回の対象外。明示nullのほか、別名や認識できない文字列から正規化されたnullも不明として扱う。

`scripts/readiness-unknown-status-review.patch` に適用前差分を保存。`scripts/validate-readiness-unknown-status-review.js` はソースをメモリ内だけで置換し、現行再現・tri-state全9組・実sessionへの統合・JSON保存復元・入力不変・正常な生応答・明示/旧保存状態名・別名を検証する。本体ファイルへ書き込まず、通常の全体検査にはまだ組み込まない。

診断状態名の補完契約が変わるため、本体適用前に上記差分の確認を受ける。適用後には本体回帰検査へ移し、画面・既存全体検査・配布・公開確認を行う。実機試験の代わりにはならない。
