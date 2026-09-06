# R2 消去後再読取・前後比較: 次の非送信実装設計

## 3.13.516 先行実装: 読取応答の厳密な組立

後述のreceipt評価器の前提として、`parseElmReadOnlyRawTranscript({profile, command, transcript, completion})` を先に実装する。対象は固定11-bit CAN表示profileの03/07/0A/0101だけ。既存の `buildObdLogPackets()` による組立を再利用し、入力形式、途中終了、source別の連番と割込みを検査する。既存Mode04パーサー・通常取込・セッション保存・画面・通信許可リストは変更しない。

参照: [ELM327公式データシート ELM327DSL](https://elmelectronics.com/wp-content/uploads/2020/05/ELM327DSL.pdf)、2026-09-06参照。本文17-18ページのD0/D1、45ページのヘッダー付き複数ECU応答、46ページのCAN message typesを照合した。H1表示ではPCIが残り、D0では独立したDLC桁を表示しない。このparserの8-byte固定受入範囲を、可変長・CAN FD・29-bitや互換品の全表示形式へ広げたとは扱わない。

Solレビューで、transportの組立とpayloadの意味判定を分離した。`matching_positive_service` / `matching_negative_service` は先頭のservice照合だけで、DTC件数やreadinessの完全性を証明しない。CANの件数byteを非CANのDTC対へ誤認しないよう、DTC payloadの奇数長制約やデコードは追加しない。各frameの `payloadSemanticsVerified:false` を保持する。`NO DATA` は状態行でありDTC空応答には変換しない。異常時は完了へ昇格せず、独立して組み立てられた応答だけを保持する。

このparserは受信済み文字列を解析する純粋関数であり、車両へ送信しない。同じ版で `evaluateGenericObdDtcClearPostReadoutReceipts()` もparserへ接続し、4 receiptの時刻順序、別attempt参照、観測sourceを評価する。別タスクの暫定parserは残さず、共通の厳密な組立処理へ統合した。意味検証、前後比較、実車接続との統合は後続工程である。

以下の設計案に対する実装時の限定: DTCの `positiveEmptySourceIds` / `positiveNonemptySourceIds` は空を維持し、matching positiveでも `indeterminate` と `payload_semantics_unverified` を返す。DTC件数形式の意味検証が未実装だからである。レディネスの観測は完全な応答だけを対象とする。clearの評価未完了は `clear_evaluation_incomplete` として保持し、再読取の評価自体を止めたり消去を再送したりしない。rootのcomparison・coverage・実行フラグは引き続きfalse。この節を後述の将来の意味判定案より優先する。

## 結論

次に実装できる最小単位は、**消去後を想定した4 intentのraw receipt証拠評価**だけである。前後比較APIはまだ実装しない。

現行の保存済み消去前sessionはraw応答を保持せず、normalizedな `reported + []` が「期待ECUから肯定応答を受信して0件」なのか「`NO DATA` 等を空へ正規化した」のかを区別できない。この状態でremoved DTCやreadiness差分を返すと、before側の取得範囲を作ってしまう。比較はbefore側にも同等のreceipt証拠契約が成立した後へ延期する。

今回の設計はfixture上の純粋評価だけを対象とし、通常画面、journal、Web Serial、bridge、clear workflowへ接続しない。実dispatcher、raw receipt producer、実transport所有権、実車識別producerは存在しないため、返却provenanceは常に `simulated_only` とする。

## 現行APIから確認できる境界

- `evaluateGenericObdDtcClearResponses()` と `createGenericObdDtcClearReceiveWindow()` (`obd-readonly.js:1434-1485`, `1601-1679`) はterminal evaluation、attempt token、expected source、completionを持つ。ただし実dispatcherには接続されていない。
- `postOperationReadOnlyFollowupPlan.intents` (`obd-readonly.js:1424-1432`) は `read_stored_dtc`、`read_pending_dtc`、`read_permanent_dtc`、`read_readiness` の固定順である。次の評価もこの順序を変えない。
- `classifyObdResponseLines()`、`decodeObdDtcResponse()`、`decodeReadinessResponse()` はframe分類と既存readout形式への変換に再利用できる。ただしclassifierは寛容な入力分類器であり、decoderの `reported` も、receipt全体の終端、期待ECU網羅、同一attempt、同一connectionを証明しない。両者だけで取得完了としない。
- `script.js:8620-8681` は07/0Aの `NO DATA` を `dtcReadoutStatus:"reported"`、`reportedStatuses:[status]`、`dtcs:[]` にできる。このnormalized結果をECU-positive emptyの証拠へ使わない。
- `script.js:8938-8951` のreadiness overrideは最後の0101応答だけを使う。複数expected ECUの網羅証拠へ使わない。
- `buildImportedSessionComparisonSummary()` は一般sessionの集約metadata比較であり、operation attempt、raw receipt、connection、期待ECUを束縛しない。今回も将来のoperation比較でも証拠境界には使わない。

## 次に実装する1 API

`obd-readonly.js` に外部I/Oを持たない `evaluateGenericObdDtcClearPostReadoutReceipts(input)` を追加する。新しい一般normalizerや保存schemaは作らない。

入力は次の3 own data propertyだけを受理する。getter、symbol、継承値、extra/missing key、暗黙変換、疎配列を拒否し、入力を変更しない。

```js
evaluateGenericObdDtcClearPostReadoutReceipts({
  clearWindowSnapshot, // terminalなgeneric clear receive-window snapshot
  clearCompletedAt, // 正規ISO日時。順序検査用であり実行証明ではない
  postReadout
})
```

`postReadout` の正確な形:

```js
{
  provenance: "simulated",
  attemptToken: object,       // clearWindowSnapshot.attemptTokenとは別の新規参照
  connectionToken: object,    // post fixture内だけの参照。clear connectionとの一致証拠ではない
  startedAt: string,
  completedAt: string,
  receipts: [
    { ordinal: 1, intent: "read_stored_dtc",    command: "03",   profile, startedAt, completedAt, completion, transcript },
    { ordinal: 2, intent: "read_pending_dtc",   command: "07",   profile, startedAt, completedAt, completion, transcript },
    { ordinal: 3, intent: "read_permanent_dtc", command: "0A",   profile, startedAt, completedAt, completion, transcript },
    { ordinal: 4, intent: "read_readiness",     command: "0101", profile, startedAt, completedAt, completion, transcript }
  ]
}
```

各receiptは上記の**8項目**だけを持つ。`completion` は `complete | timeout | disconnected | error`。`profile` は当面 `iso15765_11bit_normal_h1_caf1_d0_s1_e0` だけを受理する。未確認のprotocol/profileを汎用扱いしない。

## strict raw receipt前提

以下はパーサーの受入要件案であり、通信仕様の承認済み適合表ではない。実装前に固定profileのCAF/D設定と実際の表示形式を資料・fixtureで照合し、ISO-TP PCIやDLCが表示される前提を固定しない。Mode04の短い応答の実装を、そのまま複数フレームのDTC応答へ流用しない。この照合で契約を変更する場合はSolレビューを再度行う。

`promptObserved` のcaller booleanは受け付けない。`transcript` 自体を検査して終端promptを導出する。既存 `parseElmMode04RawTranscript()` の固定profile・ASCII・CR終端・terminal prompt・header付き11-bit CAN frame・不正行拒否の方針を、03/07/0A/0101専用の小さいstrict parserへ適用する。

- transcriptは最大32,768 ASCII文字。bare LF、制御文字、途中prompt、terminal prompt欠落、command echo、compact/headerなしframe、29-bit frame、DLC不整合を拒否する。
- ELM status行 (`NO DATA`、`STOPPED`、`ERROR`、`UNABLE TO CONNECT` 等) は明示状態として認識するが、positive frameへ変換しない。
- header付きframeのISO-TP組立はsequence、長さ、途中終了を検査する。`classifyObdResponseLines()` はstrict検査を通過したframe列にだけ使い、unknown/incomplete/sequence errorがあれば取得完了にしない。
- decoderの `reported` はsource-positive観測の必要条件の一つにすぎない。strict transcript完了、対象service、source headerを満たした実際の応答sourceだけを観測済みとする。intent別expected sourceが未成立の現段階では、網羅性やunexpected sourceを判定しない。

このstrict parserは4 intent専用であり、scanner text/CSV/importの既存normalizerを置換しない。現行 `commandResponses` はこのprofileの原文receiptとoperation boundaryを保持していないため、通常画面からこのAPIを呼ばない。

## source観測・順序・接続

`clearWindowSnapshot.evaluation.expectedSources[].sourceId` はMode 04応答評価のcaller入力であり、03/07/0A/0101の期待応答ECU集合ではない。これを4 intentへ複写せず、返却時も `clearResponseExpectedSourceIds` という参考文脈に限定する。sessionのDTC行、ECU名、単一 `sourceEcu`、手入力profile、post receiptで観測したsourceから期待集合を補完しない。

現行producerにはintent別の信頼済み期待source集合がないため、`expectedSourceScopeStatus:"unavailable"`、`readoutCoverageComplete:false`、`comparisonAvailable:false`、blocker `expected_source_scope_unavailable` を固定する。各receiptから実際に肯定応答を観測したsourceは列挙できるが、「全期待ECUを取得した」「欠落ECUなし」「unexpected ECU」とは判定しない。clear snapshotが非terminalまたはevaluation nullの場合は、これに加えてclear境界不成立として評価全体を `indeterminate` にする。

clear attemptとpost-readout attemptは別object参照を要求する。ただし `clearWindowSnapshot` は作成時のconnection tokenを公開しないため、post側の `connectionToken` とclear connectionの一致は検査できない。`sameConnectionReferenceObserved:false` と blocker `connection_boundary_unverified` を固定し、callerが別途渡したtoken同士の一致をconnection証拠にしない。post側tokenはfixture内の4 receiptを一つのpost attemptへまとめる参照にだけ使う。

時刻は `clearCompletedAt <= postReadout.startedAt <= receipt 1 ... receipt 4 <= postReadout.completedAt` の単調順序を要求し、receipt範囲の重複を拒否する。任意の最大経過秒は根拠なく導入しない。順序を満たした結果も `ordered_after_clear` であり、freshな実車取得とは呼ばない。

## receipt証拠の判定

各intentについて、strict transcript内で実際に観測したsourceごとの結果を持つ。取得済み部分を未観測ECUや期待ECU全体へ拡張しない。

- DTC `source_positive_empty_observed`: headerで識別できた各観測sourceから43/47/4Aの完全なpositive responseを受け、strict framingが成立し、既存decoderがreportedかつDTC 0件を返す。これはそのsourceの観測であり、intent全体のemptyではない。
- DTC `source_positive_nonempty_observed`: 同条件で1件以上のDTCを返す。
- readiness `source_positive_reported`: 観測sourceから完全な41 01 A/B/C/Dを受け、既存decoderがreportedを返す。全期待ECUのreadiness取得完了とはしない。
- `missing_or_unproven`: `NO DATA`、空、対象positive packetなし、attempted commandだけ、normalized `reported + []` だけ。
- `indeterminate`: source headerなし、negative/pending、parse不能、timeout、切断、error。期待source集合が未成立なので、観測sourceをunexpectedとは分類しない。

`NO DATA` は「ECUが肯定応答して0件」ではなく、source-positive証拠がない状態である。DTC 0件と表示できる既存sessionがあっても、この判定を上書きしない。

## 正確な返却契約

全階層をfreezeし、camelCaseだけの次の形に限定する。

```js
{
  schemaVersion: "generic_obd_dtc_clear_post_readout_receipts_v1",
  state: "indeterminate" | "rejected",
  provenance: {
    status: "simulated_only",
    operationBound: false,
    sameConnectionReferenceObserved: false,
    sameVehicleVerified: false,
    realTransportProofAvailable: false,
    clearResponseExpectedSourceIds: string[],
    expectedSourceScopeStatus: "unavailable",
    blockerIds: string[]
  },
  ordering: {
    status: "ordered_after_clear" | "invalid",
    clearCompletedAt,
    postReadoutStartedAt,
    postReadoutCompletedAt
  },
  readouts: [
    {
      ordinal,
      intent,
      command,
      observation,
      evidenceComplete: false,
      observedSourceIds,
      positiveEmptySourceIds,
      positiveNonemptySourceIds,
      blockerIds
    }
  ],
  receiptStructureComplete: boolean,
  readoutCoverageComplete: false,
  comparisonAvailable: false,
  operationOutcomeInferred: false,
  clearSucceededInferred: false,
  repairCompleteInferenceAllowed: false,
  technicianReviewRequired: true,
  executionEnabled: false,
  vehicleCommandEnabled: false,
  wouldTransmit: false,
  canExecute: false
}
```

`observation` はDTCで `source_positive_empty_observed | source_positive_nonempty_observed | missing_or_unproven | indeterminate`、readinessで `source_positive_reported | missing_or_unproven | indeterminate`。全4件でpositive sourceを観測しても、blockerには `simulated_provenance_only`、`dispatcher_not_implemented`、`connection_boundary_unverified`、`expected_source_scope_unavailable`、`vehicle_identity_not_observed`、`ecu_clear_scope_not_verified` を残す。

車両metadataやDTC集合の一致からsame vehicleを推定しない。現行target bindingと同様、vehicle identityは未観測、ECU clear作用範囲は未検証である。実transport proofは未取得であり、fixture、token参照一致、既存decoderの成功で代替しない。

## 集中受入マトリクス

| 条件 | 必須結果 |
| --- | --- |
| 4 intent、固定順、strict positive response | intent別の観測sourceを返す。期待範囲の完了とはせず、comparisonAvailable false、実行flag全false |
| header付きsourceから43/47/4Aの有効positive空応答 | そのsourceを `source_positive_empty_observed` とするが、intent全体のemptyにはしない |
| 07/0Aが `NO DATA`、空、attemptedのみ | `missing_or_unproven`。normalized emptyで昇格しない |
| readinessで複数ECUの0101 | ECU別に評価。最後の1件へ縮約しない |
| headerなし / sourceがintentごとに異なる | headerなしはindeterminate。観測sourceは列挙するがmissing/unexpected判定を作らない |
| negative、pending、unknown、壊れたframe、ISO-TP不完了、timeout、切断、error | 空扱いせずindeterminate。自動再試行なし |
| callerのprompt booleanだけ / decoder reportedだけ | 証拠として受理しない。strict transcript検査を要求 |
| receipt順序逆転、時刻重複、clearより前、重複intent | rejectedまたはindeterminate |
| post connectionTokenが存在し、任意のcaller-held tokenと参照一致 | clearとの一致証拠にせず `connection_boundary_unverified`、sameConnectionReferenceObserved false、送信0 |
| sample fixture | `simulated_only` を保持し、real transport proofとして集計・表示しない |
| getter、extra key、疎配列、上限超過 | 外部I/O前に拒否し、入力を変更しない |

限定validatorは `scripts/validate-dtc-clear-post-readout-receipts.js` とし、将来 `validate:obd` に接続する。spyでWeb Serial/bridge送信、journal書込/削除、workflow transitionが0回であることを確認する。

## 前後比較の保留契約

前後比較は承認済み実装契約ではない。模擬比較の設計には次の1が必要で、実通信への接続には加えて2を要求する。2の未実装を理由に、1を満たした模擬比較の開発まで停止しない。

1. 消去前側にも、4 intent、intent別の信頼済みexpected source、strict raw transcript、attempt/connection境界を保持するreceipt evidence contractがあること。
2. post側にもintent別の信頼済みexpected source集合があり、実dispatcherがclear attemptとpost-readout attemptを同じ実connection所有権へ束縛し、実車identityとECU clear作用範囲を別途確認できること。

将来の比較候補は、before/post双方のreceipt evidence summaryが同じexpected source scopeでcompleteなcategoryだけを対象にし、stored/pending/permanentを別々にadded/removed/unchanged、readinessをECU・network scope・monitor単位で比較する。status間移動は一方のremovedと他方のaddedとして保持する。

この候補はまだAPI名、入力、返却schemaを固定しない。DTC消失、readiness変化、肯定clear応答のいずれからもclear成功や修理完了を推定せず、すべての実行・送信flagをfalseに維持する。
