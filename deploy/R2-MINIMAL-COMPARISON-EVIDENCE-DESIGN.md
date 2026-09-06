# R2 比較用の最小証拠情報: 非送信の設計案

## 2026-09-07 / 3.13.519後続: 非連続monitorの模擬状態

Node専用pair handleに `inspectNoncontinuousMonitorReports(context)` を追加。検証済み0101コピーのB3でspark/compressionを選び、Cの対応bitをsupportedReported、DをincompleteReportedとしてECU別・前後別に抽出する。bit配置・区分の根拠は [python-OBD公式定義](https://github.com/brendan-w/python-OBD/blob/master/obd/codes.py) と既掲のstatus decoder（2026-09-07確認）。Mode01 PID01に限定し、PID41やメーカー独自の適用を主張しない。

sparkはcatalyst/heated catalyst/evaporative/secondary air/oxygen sensor/oxygen sensor heater/EGR-VVT、compressionはNMHC catalyst/NOx-SCR/boost pressure/exhaust gas sensor/PM filter/EGR-VVTを各定義bitへ対応させる。定義のない位置にはmonitor名を捏造せず、いずれかの報告bitが立つとunmappedBitsReportedを返す。前後で区分が違ってもそれぞれの報告値として扱い、車両変更や修理完了とは判定しない。

stateは基本monitorと同じ4区分。未対応かつ未完了、B7、または未定義位置の報告bitがある場合は保守的なローカル方針でindeterminateとする。未定義位置がある場合、そのsourceの全非連続monitorを保留する。raw/token/B/C/D byteは保持せず派生reportのみを保持。scope/context不一致・失効・disposeで取得拒否。fixtureNoncontinuousMonitorReportsAvailableのみをtrueにし、readinessEvidenceAvailable・実比較・消去成功・実車同一性・網羅性・実行/送信flagはfalse。以前の非連続monitor未実装は履歴であり、全体集計と実車適合確認は依然未実装。

追加4617件。両区分でC全256値×Dの0/同値/反転値を前後検査し、ECU/前後の区分分離、未定義位置、B7、寿命・不変性を確認。境界検証7260件、関連合計8635件がErrors 0。アプリ3.13.519・通常API・保存・実車送信は変更なし。OBD主検証・bridge・offline・実車試験は今回再実行しない。

## 2026-09-07 / 3.13.519後続: 基本3monitorの模擬状態

Node専用pair handleに `inspectBaseMonitorReports(context)` を追加。固定コピーの0101 B byteからECU別にmisfire/fuel_system/comprehensive_componentsのsupportedReported/incompleteReportedとstateを抽出する。stateはcomplete/incomplete/not_supported/indeterminateの4種類。単独handleや通常APIには公開しない。C/D byteの非連続monitorは未解釈で、readiness全体の完了を返さない。

bit対応は [python-OBD公式status decoder](https://github.com/brendan-w/python-OBD/blob/master/obd/decoders.py)（2026-09-07確認）のB0..2 supported、B4..6 not ready、B3 ignition。ignitionTypeReportedはspark/compressionの報告値に限り、実車適合の確認ではない。B7をreservedBitSetとして示す。未対応かつ未完了bitが立つ場合、またはB7が立つ場合は保守的なローカル方針でindeterminateとし、completeへ補正しない。これは公式decoderの符号化とは区別した、本試験用の判定方針。

前後の派生reportだけを保持し、raw/token/B/C/D byteは保持しない。取得時にscope/contextとdisposeを確認し、全体の比較可能性・成功・実車同一性・網羅性・実行/送信flagはfalse。monitorのcompleteは当該模擬報告の状態であり、故障なし・修理完了・消去成功を意味しない。fixtureBaseMonitorReportsAvailableだけをtrueにし、noncontinuousMonitorsInterpreted/readinessEvidenceAvailableはfalse。

追加776件でB全256値を前後で検査、複数ECU・同一応答重複・入力変更・凍結・失効・context不一致・disposeを確認。境界検証2643件、関連合計4018件がErrors 0。アプリ3.13.519・保存・実車送信は変更せず、OBD主検証・bridge・offline・実車試験は今回再実行しない。次は非連続monitorの適用区分を確認する段階であり、readiness全体を対応済みとは扱わない。

## 2026-09-07 / 3.13.519後続: MIL指示・報告DTC件数の模擬抽出

Node専用pair handleへ `inspectReadinessIndicators(context)` を追加。sequence検証済みの同じ固定receipt（0101）からsource別のmilCommandedOn/reportedDtcCountを生成時に抽出し、前後を保持する。summaryはbeforeIndicators/postIndicatorsとして取得する。単独handleには追加しない。以前の「readiness値は保持しない」は履歴であり、今回保持するのはこの二つの派生値だけ。raw・token・monitor用のB/C/D byteは保持しない。

符号化の根拠は [python-OBD公式status decoder](https://github.com/brendan-w/python-OBD/blob/master/obd/decoders.py) と [公式Status説明](https://python-obd.readthedocs.io/en/latest/Responses/#status)（2026-09-07確認）。A byte最上位bitがMIL、残り7bitが報告DTC件数。ECUの指示状態であり、実際のランプ点灯を目視確認したとは扱わない。DTC一覧との件数照合は未実装であり、値を合わせるための補正やECU間の合算はしない。

fixtureReadinessIndicatorsAvailableはこの模擬抽出だけを示す。monitorEvidenceAvailable/readinessEvidenceAvailable、実比較・消去成功・実車同一性・網羅性・実行/送信flagはfalse。readiness全体の完了、故障解消、修理完了を推定しない。取得時にscope/contextとdispose状態を確認する。矛盾・欠落・timeoutは既存sequence検査により組handleを生成しない。

新規778件でA byte全256値を前後で検査し、異なるECU・同一応答重複・不変性・入力変更・失効・dispose・矛盾を確認。境界検証1867件、関連合計3242件がErrors 0。アプリ版3.13.519・通常API・保存・実車送信は変更せず、OBD主検証・bridge・offline・実車試験は今回再実行しない。次はmonitor情報の適用条件を整理する段階であり、本変更でreadiness全体を対応済みとは扱わない。

## 3.13.519後続: 模擬clear入力検査の上限整理

一括生成前の不変性検査を再帰から明示的な作業配列へ変更した。object訪問4096回に加え、初回訪問objectのown key総数も4096までとする。上限超過は `pair_clear_snapshot_budget_exceeded`、変更可能な値は従来の `mutable_pair_clear_snapshot` と区別する。既存の深い入力も以前から上限で拒否されており、スタック障害を再現したという意味ではない。

5000段・5000プロパティの入力、循環した不正schema、32-sourceの正当なclear snapshot、内容を読まないopaque attemptTokenを検査。追加5件、境界検証1089件、関連合計2464件がErrors 0。循環の不変性検査は終了し、その後の既存schema検査で拒否される。root tokenは参照だけを扱い、caller objectをfreezeしない。これは走査量の制限であり、Proxy自身の処理時間やownKeys配列の生成コストを隔離するsandboxではない。

アプリ本体・保存・実車送信は変更なし。直前の基準1ff97043ではOBD主検証7447件・補助検証、bridge384件、offline180件の通過を確認済み。今回のNode専用入力検査変更では関連検証と構文/差分検査を実行し、OBD主検証・bridge・offlineは再実行しない。

## 3.13.519後続: 模擬差分の件数・順序・欠落境界

`scripts/validate-dtc-clear-difference-boundaries.js` を追加し、既存before-readout検証から実行する。単独実行は `npm run validate:dtc-difference-boundaries`。一括生成factoryとinspectDifferenceの実装は変更しない。

4コードの全16部分集合について全256組を検査し、追加/消失/継続の期待集合と「消失+継続=before件数、追加+継続=post件数」を照合する。入力コード順は反転し、DTC種別へ分散して検査する。各3種別で255件の全消失・全追加・順序反転の不変・部分重複をISO-TP経由で検査する。32 ECUでは同じコードが全sourceにあっても統合せず、前後でECU応答順が逆でもsourceごとの差分を維持する。

前後の各4 receiptで期待ECUの一つが欠落した場合は組handleなし。2 ECU×255件で既存parserのCAN frame上限を超えた場合も部分差分を返さない。0件との混同や共通sourceへの縮小を許可しない。これは模擬入力検査であり、実車互換性や網羅性の証明ではない。

新規1084件、既存1375件と合わせ関連2459件がErrors 0。今回の変更は検証スクリプト・実行登録・文書のみ。アプリ3.13.519、差分処理本体、保存、実車送信は変更せず、OBD主集計・bridge・offline・実車試験は今回再実行しない。

## 3.13.519後続: 組証拠からの模擬DTC差分

Node専用pair handleにだけ `inspectDifference(context)` を追加。独立before/post handleには公開しない。callerのsummaryや二つの集合を入力に取らず、一括生成時に検証して保持した内部値だけを使用する。下記の差分未実装という記述は履歴であり、ブラウザAPIや実車診断結果への組込みは依然として未実装。

intent/sourceIdごとにadded（postにだけ存在）、removed（beforeにだけ存在）、retained（両側に存在）を凍結配列で返す。前後のintent/source構造が内部で一致しなければ例外とし、交差集合への縮小や欠落sourceの無視はしない。ECU間・stored/pending/permanent間でコードを統合しない。removedは模擬入力間で見えなくなったという集合上の意味だけであり、消去成功・故障解消の表示ではない。

取得時にscope/contextとdispose状態を再確認し、失効・不一致・破棄後はsummaryなし。差分をキャッシュ・永続化せず、raw/token/readiness値を返さない。fixtureDifferenceAvailableは模擬差分の取得可否だけを示し、comparisonAvailable・clearSucceededInferred・実車同一性・消去境界・網羅性・実行/送信flagはfalseを維持する。返却済みの凍結結果は回収できず、現在の権限証明として受理しない。

回帰検査115件追加。各DTC種別で空/追加/消失/継続/置換、同一コードの種別移動・ECU移動、複数コードの部分重複、入力変更、凍結、失効、context不一致、dispose、単独handleでの非公開を検査。sequence492件、関連合計1375件がErrors 0。アプリ版3.13.519・保存形式・実車送信は変更なし。OBD主集計・bridge・offline・実車試験は今回再実行していない。readinessの意味解釈や実車比較の成立条件は別段階であり、本変更で解決したとは扱わない。

## 3.13.519後続: 前後証拠の一括生成実装

`createDtcClearDtcEvidencePairFixture` をNode専用harnessへ追加。入力は既存sequenceと同じ7項目。下記factory未実装の記述は履歴。単独handleやsummaryは受け付けず、前後の4 receiptをown data descriptorから固定コピーし、同じコピーでsequence検査とDTC抽出を行う。模擬範囲・3 attempt・順序・clear評価が不成立ならhandleを返さない。

clear snapshotは外側だけでなく内部もfreeze済みのdata descriptorだけを許可する（参照同一性だけを使うroot attemptTokenの内容は読まない）。変更可能な内部値・getterを拒否し、callerをfreezeしない。既存VMで生成したsnapshotのfollow-up-plan参照を維持する。これ自体は生成元の認証や実clear接続の所有証明ではない。内部検査は最大4096 object訪問までとし、循環の再訪も制限する。

scopeを生成前・sequence検査・抽出後に確認し、成功時だけ一つのhandleへ前後の派生DTC値を保持する。summaryはbeforeDtcEvidence/postDtcEvidenceとfixtureSequenceMatchedを持つが、差分・成功推定・実車同一性・消去境界・網羅性・送信flagはfalse。raw応答・token・readiness値は保持しない。inspectは現在のscopeを再確認し、disposeは前後を一緒に破棄する。取得済みsummaryの回収はできず、比較権限として再受理しない。

検証は既存sequence全ケースとの成立一致、片側不成立時のhandle不在、入力変更/再入失効/getter/浅いfreeze拒否、前後とintentの値の分離、scope失効、disposeを追加。sequence377件、関連合計1260件がErrors 0。アプリ版3.13.519・ブラウザAPI・保存形式は変更なし。OBD主集計・bridge・offline・実車試験は今回再実行しない。次はこの一括生成の内部値だけを対象とする、模擬DTC差分の設計とテスト。実車の比較可能性・消去成功は引き続き主張しない。

## 3.13.519後続: 前後証拠の結び付け設計と回帰検査

基準07b3175b。現在の単独before/post handleはそれぞれの取得内容とscope寿命だけを扱い、相互のattempt・順序・clearとの結び付けは保持しない。両方のinspectがokでも同一sequenceの証明にはならない。別scopeで同じJSON summaryを生成でき、beforeをdisposeしても独立postは有効なままである。これは単独handleの仕様であり、比較APIはまだ存在しない。

次の実装はNode専用の一括生成factoryとする。単独handleやsummaryを後から寄せ集めず、同一のscope/contextとbefore/clear/post入力を受け取る。両側の4 receiptを所有する固定コピーにして、その同じコピーにsequence検査とDTC抽出を適用する。clear snapshotも検査時の値と後続処理が食い違わないよう扱い、検査後にcaller入力を再読しない。既存の単独抽出器をcaller入力で順番に呼ぶだけの実装は禁止する。

- 同一の有効scope/context、固定profile、intentごとの期待source全体を両側で検査する。source交差集合への縮小やDTC値の一致を代替条件にしない。
- before/clear/postの3 attemptは別参照、時刻はbefore終了 <= clear開始 <= clear終了 <= post開始。clear評価の終端・整合性も既存sequence検査へ委ねる。模擬時刻や参照は実車の証明ではない。
- コピー前・検査後・抽出後にscopeの有効性を確認する。部分的成功では組のhandleを返さない。rawやtokenをsummaryへ出さず、将来の組handleには派生した前後値だけを保持させる。
- 組handleのinspectは現在のscopeを確認し、disposeは前後の保持を一緒に破棄する。既に取得されたsummaryは回収不能であり、入力の権限証明として再受理しない。
- 最初の組handleも差分を計算しない。comparisonAvailable・clearSucceededInferred・sameVehicleVerified・clearBoundaryVerified・実行/送信flagはfalseを維持し、保存・ブラウザAPI・実clear接続の所有証明は追加しない。

回帰検査を38件追加した。単独抽出が両方成立してもattempt再利用/clear開始の重なりではsequence拒否、別scopeの同値summary、外国context/connection拒否、summary・JSON複製・単独handleのraw入力への代入拒否、scope失効と独立disposeを確認。sequence220件、関連合計1103件がErrors 0。今回はテストと設計文書のみで、一括生成factoryは次の実装対象。アプリ版3.13.519は変更せず、OBD主集計・bridge・offline・実車試験は再実行していない。

## 3.13.519後続: postのテスト用DTC証拠抽出

`createDtcClearPostDtcEvidenceFixture({ scope, context, clearWindowSnapshot, clearCompletedAt, postReadout })` をNode専用harnessへ追加。下記before専用という記述は履歴。所有する4 receiptのコピー・抽出・inspect/disposeをbeforeと共通化し、既存scoped-post評価で模擬clearの終端・評価整合性・読み取り順序・別attempt・ECU範囲を確認してから証拠を返す。不成立ではhandleを返さない。Mode04応答元をreadoutの期待範囲に流用しない。

raw応答・tokenはsummaryに含めず、生成後のcaller入力変更を反映しない。scope失効・context不一致・dispose後は取得拒否。既に取得したsummaryの回収はできない。実車同一性・実消去境界・比較・成功・送信は引き続きfalseで、before/postのsummary自体を比較権限として扱わない。readiness値の抽出、前後比較、保存形式、ブラウザAPIは未実装。

検証: post証拠50件を追加、既存1015件と合わせ1065件がErrors 0。各receiptの欠落・timeout・範囲外・矛盾、clear不完了、順序/attempt/接続不一致、入力変更、getter、疎配列、再入失効、dispose、positive emptyを検査。アプリ版3.13.519は変更せず、OBD主集計・bridge・offline・実車試験は今回再実行しない。次は前後証拠の組合せで同一scope・別attempt・順序の結び付けをどう保証するか設計する。現時点では差分や消去成功を推定しない。

## 3.13.519後続: beforeのテスト用DTC証拠抽出

`scripts/fixtures/dtc-clear-scoped-before-readout.js` に `createDtcClearBeforeDtcEvidenceFixture({ scope, context, beforeReadout })` を追加した。Nodeのテスト専用であり、ブラウザAPI・実通信・journal/session保存には接続しない。以下の未実装という記述よりこの節を優先する。

入力の4 receiptをown data descriptorからコピーし、所有するレコードと配列だけをfreezeする。callerのtokenはfreezeしない。コピーを既存scoped-before評価へ渡し、全4 receiptのscope/意味/順序が成立した場合だけDTC集合を抽出する。不成立ならhandleなしで理由を返す。抽出ではcaller入力を読み直さず、検証済みコピーの同じ文字列を既存strict parserへ再度渡す。件数・0000枠・重複・矛盾の受入判定を再実装しない。

コード表現はP/C/B/U + 数字1桁 + hex3桁。根拠は [Scapy公式OBD_DTC実装](https://github.com/secdev/scapy/blob/master/scapy/contrib/automotive/obd/services.py)（2026-09-06確認）のsystem2bit、先頭桁2bit、残り4bit×3の構造。コード値の表現だけであり、コードの定義文や車種への適合を主張しない。一般decoderの寛容な正規化は使わない。

summaryは3つのintentごとにsourceId・positive_empty/positive_nonempty・ソート済みcodesを保持する。同一sourceの同一応答は一度だけ取り、異なるECU間やstatus間でコードを統合しない。raw文字列・CAN frame・件数byte・readiness値・tokenは出力しない。readinessEvidenceAvailableはfalse。

生成成功はテスト用handleを返す。inspect(context)は都度scopeを再照会し、不一致・失効ならsummaryを返さない。dispose()は内部summary参照を破棄し、以後の取得を拒否する。callerが既に保持している凍結summaryを回収・失効表示へ書き換える仕組みではなく、過去summaryを将来の比較APIの権限として受理しない設計が引き続き必要。永続化・エクスポートは追加しない。

実証拠・実車同一性・消去境界・網羅性・比較・消去成功・実行・送信flagはすべてfalse。今回の抽出はbeforeだけで、post証拠と前後比較は未実装。次は同じコピー・検証・寿命管理をpost抽出へ適用する。

検証: 新規51件、scope48件・scoped-before126件・scoped-post164件・sequence182件・before205件・post239件、合計1015件がErrors 0。0件、P/C/B/U表現、各serviceの2/3/255件とISO-TP、同一コードの複数ECU、矛盾、NO DATA、timeout、入力コピー後の変更、getter拒否、疎配列、失効、disposeを検査。構文・差分検査も通過。アプリ本体に変更がないためOBD主集計・bridge・offline・ブラウザ・実車試験は今回再実行しない。

## 抽出前の設計履歴

2026-09-06、基準bcf551fb / アプリ3.13.519。これは次のテスト用実装に向けた設計案であり、公開API・診断結果・永続保存形式の追加ではない。

## 現行実装との区別

`scripts/fixtures/dtc-clear-scoped-before-readout.js` のsequence評価は、模擬範囲・順序・別attemptという条件だけを検査する。DTC集合やreadiness値を返さないので、fixture_sequence_matchedからDTC差分を導出してはいけない。消去接続の所有権や実車同一性も未証明である。

今回の回帰試験は、3つのDTC intentそれぞれの消失・追加・置換・不変、readiness内容の変化、status間のコード移動でもsequence出力が同じであることを確認する。これは内容の違いがないという意味ではなく、現行APIが内容比較を実装していないという意味である。

## 次の実装単位

最初はNodeの模擬テスト内だけで、意味検証済みDTC集合をintent/source別にまとめる純粋な処理を作る。readinessのmonitor意味解釈と前後差分は別段階に分ける。DTCの符号化から表示コードへの変換は、既存の一般decoderの寛容な取込処理に任せず、固定CAN profileの検証済みpayloadに限定する。具体的な表現とAPI名は実装時にコードと資料を照合して確定する。

| 項目 | 最小限必要な情報 | 保持・推定しないもの |
| --- | --- | --- |
| DTC集合 | intent、source、意味検証後の一意なコード集合、肯定空応答か否か | raw transcript、CAN frame、DTC件数byteのコード化、複数ECUの合算 |
| 取得状態 | 未取得・未確定・肯定空・肯定非空の区別 | NO DATAを空集合へ変換、異常sourceの無言の除外 |
| 範囲と寿命 | 所有するfixture handleへの内部の関連付け、生成時の検証結果 | callerのverified flag、JSON化したtokenを認証として利用 |
| 比較の前提 | 同じintent/source/固定profile、両側の検証成立 | 同じDTC一覧やCAN IDだけで車両同一性を推定 |

raw receiptの検査後にcallerの同じオブジェクトを読み直して集合を作らない。検査済みの内部コピーから集合を導出し、検査と抽出の間の入力変更で未検証データが混ざらないようにする。検証ロジックを二重実装しないため、最初に現行の件数・重複・source矛盾検査と抽出を同じ内部段階へ置けるか検討する。

一つのreceiptに矛盾・不完全応答がある場合、現行の保守的なreceipt全体の保留方針を維持する。正常な一部sourceだけの抽出結果を、比較可能な証拠として返さない。将来部分比較を許可するなら別の診断結果契約として検討する。

## 寿命と保存

初期段階のsummaryは関数評価中またはテスト用handle内の短命な情報に限定する。journal/session/localStorage/exportには追加しない。生の応答や車両識別情報を保持する保存schemaを作らない。

凍結した過去のsummaryは現在の有効性の証明にならない。比較時にはscopeを再照会し、失効・接続世代変更・対象変更・範囲変更を拒否する。summaryを任意に生成したJSONから受け入れる設計にせず、生成元と内部コピーの関連を保持する。永続化や再起動後の復元が必要になった場合は、データ形式・保持期間・削除方針・移行方法を別途承認する。

## 将来の差分に関する制約

stored/pending/permanentは独立して比較する。status移動を特別な「解決済み」状態へ変換しない。ECU間でも同じコードを合算しない。片側が未取得・未確定ならremoved/addedを計算せず、期待範囲を共通sourceの交差集合へ縮めて欠落を隠さない。

DTCの消失は消去成功や故障解消の証明ではない。readinessの変化も修理完了の証明ではない。模擬差分を追加する段階でも、実車のcomparisonAvailable、clearSucceededInferred、実行・送信許可を有効にしない。画面の診断結果・保存契約へ組み込む際は別の判断を必要とする。

## 実装前の確認事項

抽出用のコード表現、検証済みコピーを作る場所、summaryの生成元確認と失効方法を先に固定する。最低限の試験は、同件数で内容が異なる応答、0件とNO DATA、同sourceの矛盾、複数sourceで同一コード、status移動、検証後の入力変更、scope失効。readinessの意味解釈と実clear接続の証拠を同時に解決したとは扱わない。

今回の確認結果: sequence182件（前版128件から54件増）、scope48件・scoped-before126件・scoped-post164件・before205件・post239件、合計964件がErrors 0。構文・差分検査も通過。今回の変更は文書と回帰試験だけであり、OBD主集計・bridge・offline・ブラウザ・実車試験は再実行していない。
