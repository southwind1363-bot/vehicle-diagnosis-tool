# R2 消去前証拠とintent別ECU範囲の設計案

## 3.13.519 消去前4 receiptの限定実装

以下の旧設計案に対し、消去前の模擬観測だけを先行実装した。新しい `evaluateGenericObdDtcClearBeforeReadoutReceipts({ beforeReadout })` は通常画面・保存・workflow・実通信には接続しない。before/postのstrict receipt検査とsource観測を内部関数へ切り出し、postの入出力契約・エラー識別子を保持した。偽のclear snapshotは作らない。

`beforeReadout` のown data propertyは `provenance, attemptToken, connectionToken, startedAt, completedAt, receipts` の6項目だけ。provenanceはsimulated、tokenは非null object参照、日時は正規ISO文字列。receiptsはpostと同じ03/07/0A/0101の固定4件・同じ8項目であり、同じ固定CAN profileと上限を使う。getter・余剰項目・疎配列・暗黙変換を拒否する。期待source、before session、clear時刻、verified flagは受理しない。

取得開始→receipt 1〜4→取得終了の順序だけを検査する。順序正常は `ordered_within_attempt`、不正はinvalidとroot rejected。正常でもroot indeterminate、provenance simulated_only、`clearBoundaryVerified:false` と `before_clear_boundary_unverified` を保持する。「消去より前に実際に読んだ」とは証明しない。

返却schema識別子は `generic_obd_dtc_clear_before_readout_receipts_v1`。readoutsはpostと同じsource観測項目、receiptStructureCompleteはstrict parse errorの有無だけを表す。orderingにbeforeReadoutStartedAt/beforeReadoutCompletedAt、provenanceに実証拠・対象同一性・接続一致・期待範囲未確立を明示する。post専用のclearResponseExpectedSourceIdsは返さない。比較・網羅性・成功推定・実行・送信のflagはすべてfalse。深くfreezeし、raw transcript・DTC集合・tokenを出力せず、入力は変更しない。永続保存契約ではない。

専用試験205件で正常・NO DATA・途中終了・negative・件数不整合・複数source・順序逆転・厳密入力拒否・getter非実行・凍結・非送信を確認。40通りでbefore/postのsource観測出力を比較した。post既存試験239件も通過し、6ad47d2d版との返却JSON比較を既存試験の正常返却ケースに対して実施して一致した。別realmのfollowup-plan定数参照だけは比較用に各realmへ対応させた。

期待sourceの独立したfixture scope、失効とbefore/clear/post束縛、DTC集合・readiness値の最小証拠summary、前後比較は未実装のまま。次はfixture scopeの最小契約を設計する。実車producerや保存形式を増やす判断は別工程に残す。

## 3.13.518時点の設計履歴

2026-09-06、コード基準 `92bfd4c4` / 3.13.518。設計案であり、新しい公開API・診断結果契約・保存形式の承認や実装ではない。通常取込、journal、UI、車両送信は変更しない。

## 現行コードからの結論

`evaluateGenericObdDtcClearPostReadoutReceipts()` は消去後の模擬4 receiptだけを扱う。出力にはDTCコード集合やreadiness値を保持せず、source単位の観測だけを返す。その結果だけからadded/removedを計算することはできない。

`clearResponseExpectedSourceIds` はMode04応答評価の文脈であり、03/07/0A/0101の期待sourceではない。4 receiptすべてが正常でも `expectedSourceScopeStatus` はunavailable、比較・網羅性・成功推定はfalse。clear snapshotはconnection tokenを公開しないので、時刻やcaller tokenの一致も消去をまたいだ接続の証明にはならない。

既存の正規化済みsessionは、このAPIが要求するstrict receiptと要求単位の境界の代わりにはならない。空のDTC配列、reported、保存成功だけを消去前の肯定空応答へ変換しない。出典は `obd-readonly.js` の同評価器・`createGenericObdDtcClearReceiveWindow()`、`script.js` の `buildWebSerialDtcResponseOverrides()`。規格や実車適合に関する新しい主張ではなく、コードの現状確認である。

## 次の模擬実装の範囲案

最初は消去前4 receiptの純粋評価だけを追加する。既存post評価器のために偽のclear snapshotを作って時刻をずらす実装はしない。strict parserと件数・重複検査を共有する場合は、post出力が変わらない回帰テストを先に置く。beforeの結果もsimulated onlyとし、正常応答はsource単位の観測にとどめる。

raw transcriptは評価時だけ参照し、新たにsessionやjournalへ保存しない。将来DTC集合・readiness値を比較へ渡すには、source別の最小証拠summaryとその保持期間・消去方針を別途設計する。現行結果へ無断でpayloadや新しい保存項目を追加しない。

## 期待ECU範囲の成立条件案

| 層 | 必要な根拠 | 根拠にしないもの |
| --- | --- | --- |
| 模擬範囲 | fixtureで収集結果とは独立に固定したintent別source集合 | 同じreceiptで観測したsourceのコピー |
| 実読取範囲 | 対象・接続世代・protocol/addressing・intentに束縛された信頼できるproducerと適合根拠 | Mode04の期待source、DTC行、ECU表示名、手入力のverified flag |
| 前後の対応 | 同じ範囲定義と対象、別の取得attempt、境界の途切れがないこと | 同じCAN ID、同じVIN文字列、近い時刻だけ |

source集合はintentごとに独立させる。未確立と空集合を区別し、空集合による「全件取得」の自明な成立を許さない。重複source、欠落intent、範囲変更、接続の切断・再接続は未確定または拒否にする。readinessだけで応答したsourceをDTC各serviceへ複写しない。

範囲外の観測sourceを黙って捨てて完了にせず、範囲定義との不整合として比較を保留する。範囲内sourceのNO DATA・negative・timeoutは空のDTC集合ではなく証拠不足。これはプロジェクトの保守的な設計方針であり、すべての車両が4 intentに応答するという意味ではない。

実producerは未実装。fixtureで範囲が揃った場合の模擬検査結果も、実車の網羅性・同一性・消去作用範囲の検証済み表示へ昇格させない。

## 順序と比較の制限

将来はbefore開始→4 receipt完了→clear開始→clear終了→post開始→4 receipt完了を検査する。現行入力にはclear開始の証拠がないため、beforeがclear終了より前という条件だけで非重複を証明しない。任意の鮮度秒数は導入せず、接続世代・対象・範囲の変更で証拠を失効させる設計を先に固める。

比較は同じintent・sourceの両側で意味検証と範囲が成立した場合だけを候補とする。共通sourceだけを抜き出して欠落を隠さない。stored/pending/permanentは別集合として扱い、いずれの差分も消去成功や修理完了の判定にはしない。

## 受入試験と未決事項

今回追加する試験は既存APIの境界維持だけ。全intentの肯定応答、Mode04側のsource追加、callerによるbefore/expected-source/verified値の追加でも、比較や網羅性が成立しないことを確認する。

検証結果: receipt validatorは239件・Errors 0（前版215件から24件増、fixture作成時のチェックを含む）。構文検査・差分検査も通過。アプリ本体に変更がないため、OBD全体・bridge・offline・ブラウザ・実車試験はこの設計更新で再実行していない。

次の実装前に確定する事項は、before専用の最小入出力、共有検査の切り出し範囲、fixture scopeの識別と失効方法。実producerの適合根拠、新しい診断結果・永続保存契約、実車接続は別の承認境界に残す。前後比較API名・schemaはまだ固定しない。
