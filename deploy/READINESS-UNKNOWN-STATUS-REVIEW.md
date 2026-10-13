# レディネスの不明値と状態名の整合性：修正記録

確認日: 2026-10-14。適用確認後、本体3.13.693へ反映。実機通信なし。

## 適用と検証

状態名補完の1行を適用し、専用検査を本体ソースに対する回帰検査へ移行、全体OBD検査へ組み込んだ。143項目が合格。旧1行をメモリ内で再構成した対照と比較し、対象外の値・集計・取得状態の維持を確認した。差分patchは適用前の履歴として残し、再適用しない。

実ブラウザーのJSON選択から取込、正常/不明の5状態、保存復元、既存画面の分類が合格。画面はもともとnullable booleanを用いて不明と表示していたため、今回は保存するstatusとの不一致を補正した。幅390/1280pxで横方向のはみ出しなし、外部/車両通信なしを確認。

ブリッジ384項目・オフライン183項目・データ203 JSON/DTC3,878件（警告0）・関連正規化1,183項目が合格。ブリッジ初回はsandboxのlocalhost EACCESと一時ファイルEPERMで停止し、コード変更なしの通常権限再実行で合格。全体CIの結果は下記に記録する。

配布ZIPを別フォルダーへ展開し、展開物の検証器で851ファイル／17,037,844 bytesが一致。ZIP SHA256: `DF02665B36FCF46AD90D51F0F54B2FD8409D5DF356A1C436FAB44DDD8930A7E9`。主要5資産は本体・別展開・ローカルHTTP・公開HTTPで一致。実装`70d20bff8f8c9cc8e84337ea5506fa8209169c9e`の本番`dpl_4yDhsWmHopp6YpTG5QDCrQLMRBhN`はREADYでtool.mukiguri.comへ割当済み。画面全体のブラウザー回帰とWindowsローカル1,369項目も合格。

Web CI 38483591944は個別回帰通過後、全体OBD検査中に15分上限で中断した。直前の設定変更CI 38482667991も同じ上限で中断していたため、889be646で対象ジョブだけ30分へ変更。検査内容・他ジョブ・本体コードは維持し、[Web CI 38485242930](https://github.com/southwind1363-bot/vehicle-diagnosis-tool/actions/runs/38485242930)で再実行し、4ジョブすべて成功した（Windows配布766項目・エラー0を含む）。本体コードは実装70d20bffと同一。

実装70d20bffの[iOS CI 38483591882](https://github.com/southwind1363-bot/vehicle-diagnosis-tool/actions/runs/38483591882)が成功。Swift単体113テスト・Simulator host20テスト、Swift生成RAW/NO DATAのWeb取込、全体OBD7,447項目（エラー0）を確認した。

以下は適用前に確認した差分と境界の記録。

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
