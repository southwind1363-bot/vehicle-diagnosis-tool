# R2 固定模擬receipt検証のNode/browser対応表

## 2026-10-06: 固定receiptのNode/Chromium照合

`scripts/fixtures/dtc-clear-browser-cases.js`の同じ14ケースをNode VMとChromiumページ内で独立して生成・評価し、返却値全体を照合した。正常では2 ECUの前後状態・日本語出力・dispose/失効後の拒否が一致し、実車/比較/実行関連10フラグはfalse。負例はNO DATA、範囲外source、readiness矛盾、receipt欠落、対象参照不一致、複製scope、複製follow-up-plan、scope失効、attempt再利用、時刻逆転、可変snapshot、32769文字、accessorの13種類。accessorの実行も拒否する。

ブラウザーは同一ページ内のruntimeとES moduleを使い、文字列表示を受け取るだけでなくraw receiptからhandleを生成する。各環境のtokenはその環境で作り、比較対象として移送しない。試験は既存Chromium CIから呼び、資材は明示したローカルファイルの許可リストからリクエストを差し替えて供給する。実サーバーや外部ネットワーク、車両APIを使わない。

14ケースは代表的な一致確認であり、Node境界試験全件のブラウザー移植完了ではない。通常画面・実transportへの接続や、実証拠を受け取る所有者は未実装。次は代表ケースの追加だけを繰り返さず、このページ内handleと既存controller/DOMを結び、失効時の表示消去を一体で確認する。

2026-10-06。ソース確認済みの移植計画。通常画面用のreceipt所有者は未実装。下表の「維持する検査」は現在のNode/共通runtimeの動作であり、ブラウザー移植が完了したという意味ではない。

初期化分離は実装済み。検証本体を [共通fixture core](scripts/fixtures/dtc-clear-scoped-readout-core.js) の`createDtcClearFixtureValidators(api)`へ移し、Node harnessはfs/vm初期化と7 APIの再公開だけを行う。4依存APIはown data propertyの関数を初期化時に保持する。この構造検査はruntimeの真正性や同一由来を証明しない。検査本体は依存名・インデント・注釈以外が旧版と一致することを機械照合し、既存scope/sequence/派生値/receipt検証とHTML操作検証に合格した。試験用ページ内の結合は上記14ケースで確認済み。通常画面には未接続。

## 実行環境の境界

[Node harness](scripts/fixtures/dtc-clear-scoped-before-readout.js) のfs/vmは `obd-readonly.js` を隔離VMへ読み込むために使用される。検査が呼ぶruntime APIは次の4個。ブラウザー版では、固定模擬ページで一度だけ初期化した同一のruntimeを使う。通常画面やbridgeの送信経路を接続しない。

- `evaluateGenericObdDtcClearBeforeReadoutReceipts`
- `evaluateGenericObdDtcClearPostReadoutReceipts`
- `createGenericObdDtcClearReceiveWindow`
- `parseElmReadOnlyRawTranscript`

post評価は `postOperationReadOnlyFollowupPlan` の参照同一性を確認している。同じ内容のJSON、別runtimeで作ったsnapshot、別ページから持ってきた値では代用できない。模擬receive windowの生成とpost評価を同じruntimeに置く。runtime再初期化やページ再読込時には旧handleを失効扱いにする。比較試験ではtoken参照そのものをシリアライズして移送せず、各環境内で独立して作成する。

## 対応表

| 検査段階 | 現在の所在 | 維持する検査 | ブラウザー側の対応/比較対象 |
| --- | --- | --- | --- |
| scope発行 | [scope module](scripts/fixtures/dtc-clear-readout-scope.js) `createDtcClearReadoutFixtureScope` | 固定profile、simulated、4 intentの順序、source集合、参照token | Node依存なし。ページ内モジュールとして使用し、scope snapshotと拒否理由を照合 |
| scope認識 | 同module `inspectDtcClearReadoutFixtureScope` | WeakSet登録、scope/connection/target参照、失効 | 形だけのobject、別moduleのscope、別contextを拒否。文字列IDへ置換しない |
| 入力コピー | [共通core](scripts/fixtures/dtc-clear-scoped-readout-core.js) `record` / `copyEvidenceInput` | 正確なown key、data descriptor、4要素の密配列、callerデータを変更しないコピー | 共通化候補。accessor、余分なkey、欠落を同じ分類で拒否 |
| raw解析 | [runtime](obd-readonly.js) `parseElmReadOnlyRawTranscript` | 固定profile/command/completion、prompt、CAN/ISO-TP構造、payloadと上限 | 既存APIを利用。正規化済みsummaryや通常の寛容なdecoderで代用しない |
| receipt観測 | runtime `parseGenericObdDtcClearReadoutReceipts` / `observeGenericObdDtcClearReadoutReceipts` | ordinal/intent/command、時刻、readinessの正確な長さと同source矛盾、DTC件数とpayload | public before/post評価経由で使う。内部関数を新たに公開しない |
| 前読取 | 共通core `evaluateDtcClearScopedBeforeReadoutFixture` | 開始前/評価後のscope確認、connection参照、順序、期待sourceの不足と範囲外 | 不足やNO DATAを取得済み空DTCへ昇格させない。state/reason/readoutsを照合 |
| 模擬clear受信 | runtime `createGenericObdDtcClearReceiveWindow` | attempt/connection参照、容量、terminal、poisoned状態、非送信 | ブラウザー内で固定の人工frameから生成。車両へ消去要求を送らない |
| 後読取 | 共通core `evaluateDtcClearScopedPostReadoutFixture` | terminal/evaluationの整合、distinct attempt、source範囲、scope再確認 | clear snapshotと評価を同じruntimeで生成。理由の対応を維持 |
| 前後順序 | 共通core `evaluateDtcClearReadoutSequenceFixture` | before/clear/postの3 attemptが別参照、canonical ISO、境界の非減少、前後scope充足 | 同時刻を勝手に禁止せず現行の順序規則を維持。実消去境界の証明にはしない |
| clear snapshot不変性 | 共通core `assertImmutableClearSnapshot` | 内部まで凍結、data descriptor、訪問/プロパティ予算、root attemptTokenの内容は非参照 | 表面だけのfreezeやJSONコピーで代替しない。超過/可変/descriptor不正を区別 |
| 派生値生成 | 共通core `createDtcClearDtcEvidencePairFixture` | コピー→sequence検証→DTC/readiness派生値→scope再確認 | 検証通過前に表示用値を返さない。rawを所有handleへ残さない |
| monitor対応付け | 共通core `pairMonitorStates` / `inspectMonitorStatePairs` | ECU/group/monitor別、点火方式変更/片側欠落/不明を保留 | 順序を含む派生値一致を確認。改善/悪化や消去成功を追加判定しない |
| 出力と破棄 | 共通core `dtcEvidenceHandle` / `inspectMonitorStatePairText` | 取得時scope確認、dispose後拒否、派生値freeze、日本語理由 | controller/DOMへ渡す前に検査。生token/rawをsnapshotへ公開しない |

## 数値上限と数え方

| 対象 | 現行値 | 根拠/注意 |
| --- | --- | --- |
| scope intent | 正確に4 | scope moduleのdense検査と順序検査 |
| intentごとのsource | 1～32、重複なし | scope module。11bit sourceの固定書式も検査 |
| 読取receipt | 正確に4 | copyEvidenceInput。hole/追加key/accessorを拒否 |
| transcript | 32768以下 | runtimeのJS文字列length。UTF-8バイト数ではなくUTF-16 code unit数 |
| physical line | 最大256を処理 | runtime。超過はphysical_line_overflow、黙って成功扱いにしない |
| CAN line / accepted payload | 各最大128 | runtime。can_line_overflow / payload_overflowを保持 |
| ISO-TP first frameの長さ | 8～4095 | runtime。これだけで完全受信と判定せず終端/連続frameも検査 |
| clear受信frame | 最大128 | receive window。単なる切捨てではなく既存の不整合状態を維持 |
| immutable snapshot | object訪問4096・初回訪問objectのown key合計4096 | assertImmutableClearSnapshot。訪問数は既訪問判定の前に増えるため、共有参照の再訪も計数 |

32768×4等の単純合計をページ全体のメモリ保証とは呼ばない。追加のページ全体予算が必要なら、既存検査を緩めず別途設計する。

## 既存試験の再利用と次の変更単位

[scope試験](scripts/validate-dtc-clear-fixture-scope.js)、[前読取](scripts/validate-dtc-clear-scoped-before-readout.js)、[後読取](scripts/validate-dtc-clear-scoped-post-readout.js)、[sequence](scripts/validate-dtc-clear-readout-sequence.js)、[境界/派生値](scripts/validate-dtc-clear-difference-boundaries.js)が移植時の照合元になる。正常だけでなく、不正descriptor・範囲外source・矛盾・終端状態・破棄/失効を対応させる。TypeError/RangeErrorとstate/reason返却を混同しない。

Node harnessのfs/vm初期化と検証本体の分離は完了した。次に独立した固定模擬ページで同じ検証本体を使い、Node/browser差分を照合する。factoryを通常画面の外部入力APIとして公開しない。

参考: [取得記録所有権設計](R2-BROWSER-EVIDENCE-OWNERSHIP-DESIGN.md)。実transport、実車同一性、網羅性、消去成功、実行/送信のflagは引き続きfalse。本表は実装完了や実車適合の証拠ではない。
