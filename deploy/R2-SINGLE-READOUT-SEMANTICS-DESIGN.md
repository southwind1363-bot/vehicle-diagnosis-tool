# R2 一取得内のDTC/readiness観測を共通化する契約

2026-10-06操作見本: `node deploy/scripts/preview-single-readout-interactive.js`で独立した単回の模擬HTMLをstdoutへ生成する。追加引数は拒否。正常/no_data/conflict/missing_promptと人工失敗を選択し、条件変更で旧表示を閉じる。開始時の固定記録を所有し、自動取得/自動再試行はしない。単回版はreadonly owner/validation/sessionだけを固定manifestへ収録し、clear sampleを生成しない。共通の操作処理とCSP、私有runtimeを使用。オフラインChromiumで本文一致、待機中切替・閉鎖・失敗・回復、pagehide・履歴復帰、キーボード・幅・未許可script拒否を検証。通常UIや配布ZIPには追加していない。

2026-10-06表示接続: 固定の正常/no_data/conflict/missing_promptだけを生成するsingle-readout-preview-sessionを追加。所有者で検査後、inspect時にticketを再確認して日本語へ変換する。source一覧・raw・payloadは表示しない。全体の0件やreadiness全項目完了は主張せず、対象ECU範囲の未確認を各区分に残す。共通controllerと一取得用DOM adapterで更新/閉鎖/遅着成功・失敗を34項目で確認。意味検証APIのないruntimeは表示不可。通常UIへの接続や操作HTMLへの追加は未実施。

2026-10-06実装: evaluateSingleReadoutRawReceiptsを追加し、前後評価器とraw構造検査・内部observerを共用。新入口は4 raw receiptのみを受け、日時/接続tokenを要求しない。取得元はunverified_input、source/raw/payloadは非公開、全権限flagはfalse。開発用所有者のfinishへ接続し、文法と意味観測を別々に保持。17ケース/346項目、変更前の前後評価結果全体17ケース一致、Node/Chromiumの新入口一致を検証する。通常UI/実transport/保存へは未接続。

2026-10-06。ソース確認済みの設計。実装、診断分類、保存schema、送信許可は変更していない。

## 共通化する範囲

[obd-readonly.js](obd-readonly.js) の `observeGenericObdDtcClearReadoutReceipts` は、前読取評価器と後読取評価器の両方から呼ばれる内部関数である。DTCのcount/pair整合、readinessの長さ/同一source内の矛盾、負応答やparser errorによる保留をここで判定している。

既存の公開入口 `evaluateGenericObdDtcClearBeforeReadoutReceipts` はISO日時、attempt/connection参照、simulated provenance、固定4 receiptを要求する。新所有者の数値時刻を仮のISO日時に変換したり、仮の接続参照を足したりしてこの入口へ合わせない。二回分の記録や模擬clear受信も作らない。

共通化はrawから観測分類を得る部分に限定し、前/後の時刻順序、clear境界、scope、車両同一性、網羅性の評価から分離する。新しい診断ルールを追加せず、既存の判定を一つの実装へ集約する。

## 維持する判定（ソースで確認）

| 条件 | 既存の観測 | 維持する境界 |
| --- | --- | --- |
| DTC payloadの長さが `2 + count * 2` と一致 | source単位でcount=0/非0を分類 | serviceだけの応答やpaddingを件数へ補正しない |
| DTCの0コード、重複コード、同sourceの異なるpayload | `dtc_payload_conflict`、`indeterminate` | 良好sourceが混在しても当該receiptのempty/nonempty一覧を肯定結果として残さない |
| 同sourceの同一DTC payload再報告 | 重複sourceをまとめる | 異なるpayloadの混在とは区別する |
| readinessが正確に6 byte、同source内でpayload一致 | `source_positive_reported` | これだけで全monitor完了・故障解消を判定しない |
| readiness長さ違い・同source内の不一致 | `readiness_payload_conflict`、`indeterminate` | 不足byteの0埋めや良好frameだけの採用をしない |
| timeout/切断、parser error、matching negative service | `indeterminate` | 正応答との混在でも完全な証拠にしない |
| NO DATAのみ・正応答未観測 | `missing_or_unproven` | acquired-emptyやDTCゼロ件へ変換しない |

既存observerはreadiness矛盾時にも診断用のobservedSourceIdsを持つ場合がある。共通化でこれを勝手に消去・再分類しない。利用側はobservationとblockerを含む結果全体を扱い、source一覧だけから成立を推定しない。

## 新しい入口の制約（未実装）

開発用の一取得検証入口は、管理元が保持している四つのraw receiptからだけ計算する。外部のparsed frame、保存summary、payloadSemanticsVerifiedフラグを入力として受理しない。構造を確認し、同じruntimeのraw parserを呼んだ後に共通observerを使う。期待intent/command順序は固定し、raw上限とdescriptor検査を緩めない。

日時・接続参照を入力要件に加えない。この入口は時刻の真正性・同一接続・実取得元を検査しないため、それらの成立を出力しない。所有者の世代/終了状態は呼出前後に検査し、例外や失効時は結果を破棄する。

戻り値はcommand/intent別のobservationとblockerを主とする。rawやpayloadを公開しない。内部observerのsource一覧が必要な既存前後評価器は従来の出力を維持する一方、今回の所有者向けsummaryではsource一覧を公開しない方針を維持する。

`receiptStructureComplete`、raw文法の`parsed`、sourceの正応答観測、実取得元の証明は別の概念である。トップレベルのpayloadSemanticsVerifiedを一律trueへ変更しない。実車同一性、網羅性、消去境界、比較可否、実行・送信は引き続きfalse。

## 実装手順と検証

1. 内部observerの入力依存を最小化する。まず本体内の共通関数として維持し、通常ページへ新しいscript依存を追加しない。前後評価器からの既存呼出結果を丸ごと照合する。
2. rawを受ける一取得入口を追加する際は、4 receiptの構造検査と意味観測を共通化し、既存評価器のISO日時/順序検査は従来入口で維持する。日時を捏造したadapterや検証コードのコピーを作らない。
3. 正常empty/nonempty、count不一致、0/重複コード、同一/矛盾payload、readiness短長/矛盾、negative混在、NO DATA、grammar errorを同じfixtureで旧結果と比較する。例外形式、blocker順序、source重複処理も保持する。
4. 新所有者のfinishへ接続し、構造/文法/意味観測を区別したsummaryを保持する。処理中失効・新世代・例外で旧結果が残らず、raw参照を終了時に解放することを試験する。
5. runtime資材を変える実装では、既存OBD/前後receipt/境界/ブラウザー検証、配布資材・キャッシュ・バージョン手順を確認する。今回の設計だけで配布ZIPを更新しない。

主な照合元: `validate-dtc-clear-before-readout-receipts.js`、`validate-dtc-clear-post-readout-receipts.js`、`validate-dtc-clear-difference-boundaries.js`、`validate-elm-readonly-transcript.js`、`validate-readonly-receipt-owner.js`、`validate-readonly-receipt-raw-validation.js`。

通常UI・実transport・実車試験は別工程。意味観測を追加しても、消去後の再読取や修理完了を確認したとは報告しない。
