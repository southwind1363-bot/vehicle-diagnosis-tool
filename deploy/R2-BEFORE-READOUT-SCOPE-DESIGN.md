# R2 消去前証拠とintent別ECU範囲の設計案

## 3.13.519後続: before/clear/postの模擬順序検査

`evaluateDtcClearReadoutSequenceFixture()` をNode専用ハーネスへ追加。入力はscope/context/beforeReadout/clearWindowSnapshot/clearStartedAt/clearCompletedAt/postReadoutだけ。clearStartedAtは今回のfixture入力であり、実dispatcherから取得した時刻ではない。通常API・保存形式・アプリ本体は変更しない。

一つのscope handleとcontextでbefore/postのraw receiptをそれぞれ再評価し、両側の接続参照一致、範囲一致、clear評価完了、各側の内部順序を要求する。before完了 <= clear開始 <= clear終了 <= post開始を正規ISO日時で照合し、等しい隣接境界は許す。before/clear/postのattempt参照は三つとも異なることを要求する。before開始や各receipt内の順序検査を省略するものではない。

順序不正、attempt再利用、接続/対象/範囲不一致、失効はrejected。beforeまたはpostが範囲未一致、あるいはclearが未完了ならfixture_sequence_incomplete。すべて揃った場合だけfixture_sequence_matched / fixtureSequenceMatched trueを返す。raw情報・token・source集合・DTC集合は返さない。結果は凍結し、実証拠、実車同一性、clearBoundaryVerified、網羅性、比較、消去成功、実行、送信flagはfalse。

clear snapshotは接続所有権を公開しないため、clear接続がbefore/postと同じことを検証したとは扱わない。試験では別のclear接続参照でも模擬順序だけは成立させ、実証拠flagがfalseのままであることを確認する。caller時刻やtoken一致を実車の事実へ昇格させない。新しい実clear証拠契約やdispatcherとの統合は別工程。

順序128件、scope48件、scoped-before126件、scoped-post164件、before205件、post239件、合計910件がErrors 0。境界逆転・重複attemptの全ペア・両側4 intentの未取得/範囲外/timeout・clear未完了・失効・getter拒否を検査した。before validator経由でvalidate:obdへ接続。構文・差分検査を実施し、アプリ本体変更なしのためOBD主集計・bridge・offline・ブラウザ・実車試験は今回再実行しない。次は比較に必要なsource別の最小証拠summaryの設計であり、DTC差分や修理完了の推定は未実装。

## 3.13.519後続: 消去後側の模擬範囲照合

同じNode専用ハーネスに `evaluateDtcClearScopedPostReadoutFixture({ scope, context, clearWindowSnapshot, clearCompletedAt, postReadout })` を追加した。beforeとsource照合関数を共有し、postは現行のstrict評価器をそのまま呼ぶ。アプリ本体・通常API・保存形式・版番号は変更しない。

handleの生成元確認、評価前後の失効照会、contextとpost receiptの接続参照一致を検査する。clear/postのattempt再利用や時刻逆転はrejected。clear snapshotと評価のcompletion不一致、非terminal、評価未完了のいずれかがあればfixture_scope_incompleteとし、readoutsを返さない。消去後の4応答が正常という理由でこれらを上書きしない。

Mode04の期待sourceとは独立したfixture範囲を照合する。試験では消去側7EA、読取側7E8/7E9を指定し、消去側の集合を読取側へ複写しないことを確認した。clear側のconnection tokenはsnapshotに含まれないため、その一致や実dispatcher所有権を証明しない。scope照合が成立してもclearBoundaryVerified・readoutCoverageComplete・comparisonAvailable・clearSucceededInferred・実証拠・同一性・送信flagはfalse。

`createDtcClearFixtureReceiveWindow()` はテスト用clear snapshotを現行評価器と同じVMで作るfactoryであり、follow-up-planの定数参照同一性を維持する。別realmのsnapshotを受け入れるために定数や検査を差し替えない。factoryも模擬モデルにすぎず、caller入力が実車の事実だと認証するものではない。

scope48件・scoped-before126件・scoped-post164件・before205件・post239件、合計782件がErrors 0。scoped-postは各intentのNO DATA、範囲外肯定応答、timeout/disconnected/error、negative、内容矛盾、wrong service、prompt欠落、clear未完了、attempt再利用、順序逆転、失効、偽handle、getter拒否を検査する。before validator経由でvalidate:obdにも接続。構文・差分検査を実施し、アプリ本体変更なしのためOBD主集計・bridge・offline・ブラウザ・実車試験は今回再実行しない。

次はbefore/clear/postを同じfixture scopeと接続世代へ束縛する順序設計。現行のclear開始時刻・接続所有権の証拠がない問題は残る。DTC集合やreadiness値の前後比較、診断結果・保存schema、実車操作は追加しない。

## 3.13.519後続: scopeと消去前模擬応答の照合

`scripts/fixtures/dtc-clear-scoped-before-readout.js` にNode専用の `evaluateDtcClearScopedBeforeReadoutFixture({ scope, context, beforeReadout })` を追加した。テスト側から現行obd-readonly.jsを分離VMへ読み込み、strictなbefore評価器を呼ぶ。アプリ本体・通常API・保存形式・通信経路に変更はない。

scopeは同じfixture moduleで生成したhandleだけをWeakSetで受理する。任意のinspect関数、凍結済みの古いsnapshot、callerが作ったreadouts要約を信用しない。contextはscopeToken/connectionToken/targetTokenだけをown data propertyとして受け取り、beforeReadoutの接続参照がcontextと同じことも検査する。これは模擬入力の参照照合であって、実車や実接続の認証ではない。

評価の前後でhandleを照会する。失効、不一致、before順序不正はreadoutsを返さずrejected。現行before評価器の入力拒否は例外のまま返す。raw transcriptから改めて評価するため、callerが空配列やreportedという要約を渡して成功扱いにする経路はない。

intentごとにfixtureExpectedSourceIds、missingFixtureSourceIds、positiveSourceIdsOutsideFixtureを返す。missingは「意味検証済みの肯定応答が不足」であり、ECUが実在しないという意味ではない。範囲外配列は観測できた肯定応答sourceだけを扱い、negativeやparse不能応答の全source一覧ではない。これらの異常は元のobservationがindeterminateとなるため、範囲一致を阻止する。

DTCはpositiveEmptySourceIds/positiveNonemptySourceIds、readinessはsource_positive_reportedのsourceだけを有効な観測として照合する。期待sourceの不足・範囲外の肯定応答・未確定/未取得のいずれかがあれば、そのintentはfixtureScopeMatched false。4 intentすべてが満たす場合だけstateはfixture_scope_matchedとなる。これはテスト指定範囲との一致であり、readoutCoverageComplete・comparisonAvailable・clearSucceededInferred・実証拠・実車同一性・消去境界・送信flagはfalseのまま。raw文字列やtokenは返さない。

照合試験126件、scope48件、before205件、post239件を実行してErrors 0。評価中の失効も評価後の再照会で拒否する試験を含む。既存before validatorから新規試験を読み込み、validate:obdにも間接接続する。構文・差分検査を実施し、アプリ本体に変更がないためOBD主集計・bridge・offline・ブラウザ・実車試験は今回再実行しない。次はpost側の模擬範囲照合とbefore/clear/postの境界設計であり、DTC前後比較はまだ追加しない。

## 3.13.519後続: テスト専用の範囲と失効モデル

`scripts/fixtures/dtc-clear-readout-scope.js` に `createDtcClearReadoutFixtureScope()` を追加。ブラウザ向けAPIではなく、before/post評価器・UI・保存・実通信には接続しない。アプリ本体と版番号は3.13.519のまま。

入力はown data propertyの `provenance, profile, connectionToken, targetToken, byIntent` だけ。provenanceはsimulated、profileは既存の固定11-bit CAN形式、tokenは非null object参照。byIntentは03/07/0A/0101に対応する固定順の4行で、各行はintent/sourceIdsだけ。sourceIdsは各intentにつき1〜32件、3桁大文字hexの000〜7FF、重複・空・暗黙変換を拒否する。32件はテストモデルの上限であり、実車のECU数や適合の主張ではない。入力配列をコピーし、source順だけを正規化する。各intentの集合は合算・相互補完しない。

raw応答・観測結果・Mode04 snapshotを入力に受け取らない。ただしcallerが観測したsourceを入力へコピーしていないことまで証明する仕組みではない。範囲を収集結果とは別の入力にするテスト規律であって、実際の独立性や正当性の認証ではない。

生成時に新しいscopeTokenを発行し、inspect/invalidateにはscopeToken・connectionToken・targetTokenの3参照を要求する。いずれかが不一致ならsnapshotなしで拒否し、失効操作も状態を変えない。正しいinvalidateは一方向にinvalidatedへ移り、source一覧を空にした失効snapshotを返す。その後のinspect/invalidateは拒否する。再作成は新しいscopeTokenを発行し、古い参照を受理しない。接続変更を自動検知するproducerはなく、モデル利用側が新しい接続世代参照を渡すか、旧範囲を失効させる必要がある。

snapshotは凍結した観測時点の情報であり、有効性を保持する権限ではない。過去に取得したactive snapshotから後の失効を検知できるとは扱わず、将来の評価器はhandleへ都度照会する設計が必要。参照一致も実接続や実車同一性の証拠ではない。返却provenanceはsimulated_only、実証拠・同一性・網羅性・比較・成功推定・実行・送信flagはfalse。

検証は `npm run validate:dtc-scope` の48件と、before205件・post239件がErrors 0。before validatorからscope validatorを読み込み、既存validate:obdにも間接接続する。新規・関連ファイルの構文と差分を確認した。アプリ本体に変更がないためOBD主集計・bridge・offline・ブラウザ・実車試験は今回再実行しない。次はこのテスト専用handleと模擬receiptのscope照合を設計する段階であり、比較機能や実車網羅性の判定は追加していない。

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
