# レディネスの欠落項目：修正記録

確認日: 2026-10-15。適用確認後、本体3.13.694へ反映。実機通信なし。

## 適用後の検証

承認された2条件を本体へ適用し、専用検査を実ソースに対する回帰検査へ移行して全体OBD検査に組み込んだ。旧既定値の再構成はテスト専用対照とする。差分patchは履歴であり、再適用しない。

欠落値144項目・既存null値143項目と、両ブラウザーの実JSON取込/保存復元が合格。前回のnull検査にあった「欠落値は対象外」という対照期待が停止したため、今回の承認済み仕様に従ってnull/null/unknownの明示期待へ更新し、再実行して合格した。正常な値の検査は維持。関連正規化1,183項目も合格。ローカルのoffline 183資産、data 203 JSON / 3,878 DTC、bridge 384項目もエラー0。通常ブラウザー回帰とWindowsローカル1,369項目も合格した。同一コードSHAの[Web CI run 38638793308](https://github.com/southwind1363-bot/vehicle-diagnosis-tool/actions/runs/38638793308)は全4ジョブ成功。全体OBD 7,447項目・専用欠落値144項目・Linux bridge 365項目、Windows非実行レビュー、Windows配布766項目、Chromiumのオフライン取込/再起動復元/固定モニター検査が合格。[iOS CI run 38638793022](https://github.com/southwind1363-bot/vehicle-diagnosis-tool/actions/runs/38638793022)も成功。Swift単体検査、RAW/NO DATAのWeb取込連携、シミュレータービルドと統合検査、全体OBD 7,447項目・専用欠落値144項目、未署名端末IPAのビルド/検証/保存まで合格。実機接続・署名配布・車両適合確認ではない。

配布ZIPは展開後に851ファイル / 17,037,872 bytesの整合性検査が合格。SHA256: `DB00E329F81A1DF18AD61204EB3EF043C17AA45F0AE7D1DD41A9AF0047D270A7`。公開5資産（index.html / script.js / obd-readonly.js / service-worker.js / offline-assets.json）はHTTP 200で、本体・展開ZIPとLF正規化後に一致した。コードコミット`a2f2fe04fc9596d8d62fe9047c647a8ea03b0766`の本番deployment `dpl_F3NjBZ3sbbUhGQLWfnYVqKfGFXGe`はREADY。

以下は適用前に確認した差分と境界の記録。

## 再現した問題と具体的な差分

前回は明示nullからの状態名補完を修正した。今回は、supported/completeが欠け、意味のある状態文字列もない場合に、対応true・完了falseを補う別の既定値を点検した。

| 入力行（状態名なし） | 現行 | 修正案 |
| --- | --- | --- |
| 項目名だけ | 対応true・完了false、未完了1件 | 両方null、対応状態不明1件 |
| supported:trueだけ | 完了false、未完了1件 | 完了null、完了状態不明1件 |
| complete:trueだけ | 対応true、完了1件 | 対応null、対応状態不明1件。complete:trueは保持 |
| complete:falseだけ | 対応true、未完了1件 | 対応null、対応状態不明1件。complete:falseは保持 |
| supported:falseだけ | 完了false、非対応1件 | 完了null、非対応1件を維持 |

`normalizeReadinessSnapshot`の2条件へ、正規化された状態文字列が空の場合を追加する案。別名is_supported/is_completeも同様。空白だけの状態文字列も欠落値の補完根拠にしないが、入力済みの状態名そのものは書き換えない。

## 維持する境界

- 前回の明示nullを含む3値×3値の9組、明示された完了/未完了/非対応等の状態名、正常な生応答の結果は維持する。
- 取得状態readinessReadoutStatusは維持する。観測行があることと、その行の対応/完了が分かることは別に扱う。
- 保存schema、元入力、ECU識別、車両送信権限は変更しない。
- 旧保存記録の補完済みtrue/falseや状態名は自動修復しない。明示状態名とbooleanの矛盾、未知の非空vendor状態名の解釈は今回の対象外。

## 検証結果

`node scripts/validate-readiness-missing-fields-proposal.js`の144項目が合格。現行の推定を再現した上で、欠落行9ケースの通常session統合・JSON保存復元・不明集計・入力不変・実行権限false、明示状態名14種、明示3値9組、正常/欠落生応答4例を確認した。

`validate-readiness-missing-fields-browser.cjs`はメモリ内の修正ソースだけをブラウザーへ供給し、通常JSON選択→取込→状態名/画面分類→保存復元を検証した。項目名だけ、対応のみ、完了のみ、明示未完了、明示非対応の5行が期待どおりになり、390/1280pxで横方向にはみ出さず、外部・車両通信は0件だった。実車の対応確認ではない。

差分は`readiness-missing-fields-review.patch`に保存し、`git apply --check --ignore-space-change`が合格。本体は変更せず、検査を通常全体検査へまだ組み込まない。診断値と集計の補完契約が変わるため、適用前に確認を受ける。適用後に本体回帰・全体CI・配布/公開検証へ進む。
