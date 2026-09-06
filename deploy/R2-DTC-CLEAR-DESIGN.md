# R2 汎用OBD DTC消去: 次の非送信実装設計

## 3.13.509 記録候補の準備状態表示と解除

3.13.508で明示照合した候補を、同じ保存記録欄の「消去前確認」に表示する。既存の再検証済み関連付けからcontrollerのスナップショットを参照し、記録ID、未設定の対象、準備条件数と折りたたみの未確認条件を表示する。新たな条件判定やチェック入力は追加しない。

「比較候補を解除」はページ内の比較関連付けと表示だけを消す。controllerの遷移、車両操作の取消、保存記録の削除、診断結果の変更ではない。一覧・選択記録・ダウンロード・保存成否を保持し、再関連付けには明示照合を必要とする。車両送信と保存形式に変更はない。Sol設計確認済み。

## 3.13.508 消去前記録候補の明示照合

Sol設計レビューに基づき、検証して読み込んだ保存記録と現在の読取結果を明示操作で照合する。保存JSONのexported_atを固定して現行のエクスポート処理を呼び、文字列の完全一致を要求する。車種名やDTC一覧だけの部分一致、時刻の推定、旧形式の自動変換では代替しない。エクスポート処理の変更で古い記録が一致しない場合も、照合不能として扱う。

一致時だけ、target:null・preOperationSessionId:記録ID・evidence:{}の非送信controllerを作る。これはローカル記録の候補参照であり、記録内のセッションIDや車両同一性を証明しない。状態はpre_save_required、保存条件を含む全準備条件と実行フラグは未完了/falseのままとする。通常診断の結果、IndexedDB形式、JSON入出力形式、通信許可リストは変更しない。

関連付けは保存成否とは別のページ内状態に置く。保存/読込だけでは自動設定しない。読取更新、選択記録や一覧世代の変更、新たな保存確認、閲覧欄を閉じる操作、ロック、タブ・モード・段階移動で失効させる。車両同一性、対象ECUと送信範囲、適合、実行前条件、消去許可をこの一致結果から自動認定しない。

受入項目: 完全一致と参照ID、全準備条件未完了、送信0、不一致・時刻不正・処理中の拒否、同一オブジェクト内変更と差し替え、保存中の結果変更、選択変更・ロック・画面移動の失効。画面と既存保存/閲覧・遷移検証を確認してから公開する。

## 目的と今回の範囲

R2の次のコード単位は、DTC消去の判断と監査状態を表す**純粋なワークフローモデル**だけとする。車両送信、transport allowlist変更、UI、保存JSON形式の変更は含めない。消去成功と修理完了は別判定とし、要求値や応答値は対象transportの根拠確認前に定義しない。

## 既存の根拠

- `obd-readonly.js:176-188` は `clear_dtc` を state-changing / blocked-until-safe とし、消去前保存、明示確認、復旧、再スキャンを要求している。
- `obd-readonly.js:238-250` の12条件と `buildServiceOperationReadiness()` (`obd-readonly.js:1287-1329`) は、全条件達成時も `executionEnabled`、`vehicleCommandEnabled`、`wouldTransmit`、`canExecute` を false に保つ。
- `obd-readonly.js:300-338` の実験契約は、適合、前後証拠、明示確認、復旧計画、transport/protocol確認と監査項目を定義するが、実行transportは未実装である。
- `requestVehicleOperation()` (`obd-readonly.js:42388-42399`) と画面 (`script.js:12362-12425`) は、状態変更操作を実行せず無効表示する。
- 再読取に使える既存intentは stored/pending/permanent DTC と readiness (`obd-readonly.js:709-721`)。新しい生コマンド値は不要である。
- 親タスク確認済み境界: `isAllowedObdDeveloperCommand()` (`script.js:8364-8366`) は `WEB_SERIAL_READ_ONLY_COMMANDS` だけを許可し、`local-bridge-readonly.js:107-115` の `BLOCKED_WRITE_INTENTS` は `clear_dtc` を拒否する。既存の operation-availability 72件、bridge 384件は合格済み。この設計では同じ検査を重複追加しない。

## 不足しているもの

- 1回の消去意図に、消去前記録、対象、確認、dispatch結果、再読取結果を結び付ける状態モデル。
- 確認後の対象変更を検出し、確認を失効させる規則。
- timeout/切断等で結果が不明な場合に、自動再送せず再読取へ送る規則。
- 要求結果、DTC消去の観測結果、修理完了を分離する判定。

transport/protocolの適合表、実要求・応答の判定、実車試験、公開開放条件は別工程であり、このモデルでは補完しない。

## 最小コード単位

### 3.13.494 実装API

`buildGenericObdDtcClearWorkflow({ target, preOperationSessionId, evidence })` で開始する。`target` は `vehicleId` / `ecuId` / `transportId` の3参照、`evidence` は既存の事前11条件の真偽値のみ。`impactAcknowledged` を初期入力から受け付けない。参照は非空・最大128文字とし、未知フィールドや不正型はTypeErrorのcodeで拒否する。

遷移イベントは `update_input`（revisionと変更するtarget/session/evidence）、`record_confirmation`（revision、target、preOperationSessionId、impactAcknowledged:true）、`request_dispatch`（revision）の3種。更新はrevisionを進めて確認を失効させる。`request_dispatch` は常に非送信の `dispatch_blocked` まで。画面・保存セッションには未接続である。

`obd-readonly.js` に、外部I/Oを持たない `buildGenericObdDtcClearWorkflow(input)` と `transitionGenericObdDtcClearWorkflow(workflow, event)` を追加する。既存の `buildServiceOperationReadiness("clear_dtc", evidence)` を唯一の準備条件判定に使い、入力オブジェクトを変更しない。この単位は `dispatch_blocked` までとし、dispatch結果を入力するAPIは作らない。

返却値は当面セッションへ保存せず、次の最小フィールドに限定する。

- `schemaVersion: "generic_obd_dtc_clear_workflow_v1"`
- `operationId: "clear_dtc"`, `state`, `revision`
- `target`: 車両/ECU/transportを指す既存識別子の参照。値を推定しない
- `preOperationSessionId`, `readiness`, `confirmation`
- `dispatch`: `attempted:false`, `outcome:"not_attempted"`, `retryAllowed:false`, `wouldTransmit:false`

すべての返却経路で `executionEnabled:false`、`vehicleCommandEnabled:false`、`wouldTransmit:false`、`canExecute:false` を固定する。API exportは純粋関数2個だけとし、`script.js` から呼ばない。

## 今回実装する状態遷移

| 状態 | 受理する事実/操作 | 次状態 | 不変条件 |
| --- | --- | --- | --- |
| `pre_save_required` | `impactAcknowledged` 以外の11条件と消去前セッション参照が揃う | `confirmation_required` | `buildServiceOperationReadiness()` のchecksをIDで確認し、不足を独自判定で隠さない |
| `confirmation_required` | 対象、影響、消去前記録を同一revisionで明示確認 | `confirmation_recorded` | 確認により `impactAcknowledged:true` としてreadinessを再構築し、12条件完了を要求する |
| `confirmation_recorded` | `request_dispatch` | `dispatch_blocked` | readinessが完了しても `canExecute:false` を権限境界とし、attempted=false、wouldTransmit=false |

`operator_authentication`、`vehicle_applicability_confirmed`、各保存条件、比較根拠、取消導線、再スキャン/復旧計画、実機通信条件、独立安全検証は事前11条件である。`impact_acknowledged` だけを確認操作で満たす。対象または消去前記録が変わったら確認と `impactAcknowledged` を破棄し、readinessを再構築する。`ownerExperimentEligibleForImplementation` は実装候補情報にすぎず、`canExecute:false` を上書きしない。

## 後続単位の状態契約

### 3.13.496 非送信モデルの取消

`cancel` イベントは `{ type: "cancel", revision }` だけを受理し、既存の4状態から終端状態 `cancelled` へ移る。対象、消去前セッション参照、事前11条件、revisionは維持し、確認記録の全参照をnullへ戻して `impactAcknowledged:false` とする。送信・実行フラグはfalse、dispatchは未試行のまま。取消済みの状態から更新、再確認、再要求、再取消へは進めない。revision上限直前でも取消は番号を増やさず成立する。

これは現在の純粋なスナップショットの遷移を終了するだけであり、呼出元が保持する古いスナップショットを失効させる認証・排他制御ではない。将来の実行管理側では現在状態の一元管理と古い要求の拒否が別途必要。車両通信中の取消や送信停止を実装した意味ではない。

3.13.495から開発資料で初期モデルを表示しているが、状態遷移・確認・取消・保存・実行にはUIから接続していない。上記の3.13.494の「script.jsから呼ばない」は当初の実装範囲を示す。

`dispatching`、dispatch結果、`reread_required`、前後比較は、承認済み専用dispatcherと信頼できる結果境界を設計する後続単位へ延期する。今回の純粋関数は、呼出元が作ったworkflowやイベントを実dispatchの証拠として受け入れない。

後続単位ではtimeout、切断、応答破損を `outcome:"unknown"` とし、自動再送せず stored/pending/permanent DTC と readiness の再読取へ進める。同一確認での再試行は禁止し、必要時は再読取後に新しいrevision、消去前記録、明示確認を要求する。前後比較は `observed | not_observed | indeterminate` とし、要求受理やDTC非表示だけで修理完了と判定しない。

## 次の実装時のテスト

- 初期状態、入力非変更、camel/snake aliasを安易に増やさない固定schema。
- 事前11条件、`impactAcknowledged`、保存参照、対象の各不足を区別し、確認前に12条件を要求する循環を作らない。
- 確認イベント後にreadinessを再構築し、12条件完了後も送信4フラグと `canExecute` が false。確認前dispatch、古いrevision、対象変更後の確認を拒否。
- `request_dispatch` は `dispatch_blocked` となり、Web Serial/bridge関数を一度も呼ばない。
- forgedな `dispatching` 状態やdispatch結果イベントを受理しない。
- operation-availabilityとbridge既存検証は変更せず、純粋モデルの単体検証を `validate:obd` 経由へ追加する。個別確認は `node scripts/validate-operation-availability.js` を使う。

## 後続の開放条件

通信仕様の確認結果と次工程の受入項目は [R2-ELM327-PROTOCOL-EVIDENCE.md](R2-ELM327-PROTOCOL-EVIDENCE.md) を参照。現在の単一ECU参照を機能宛て要求の消去範囲と同一視しない。汎用要求/肯定応答の根拠確認は進んだが、車種適合・実行transport・監査保存契約は未完了である。

### メモリ内の現在状態管理

3.13.497: `createGenericObdDtcClearController(input)` は `getSnapshot()` と `transition(expectedSnapshot, event)` を持つ凍結オブジェクトを返す。最新参照でない場合は `stale_dtc_clear_workflow_snapshot`、同期処理中の再入は `reentrant_dtc_clear_workflow_transition` として拒否する。それ以外の入力と遷移の検証は既存の純粋APIへ委譲する。成功時だけ現在参照を置き換え、例外時も処理中フラグを解除する。

純粋APIは古いスナップショットを独立して扱えるため、利用側へ接続する前に現在状態を一か所で保持する層を置く。状態変更は現在のスナップショット参照を要求し、JSON複製、別管理インスタンスの参照、以前の参照は拒否する。確認・取消がrevisionを増やさない場合も、参照は更新されるため古い要求を見分けられる。

この管理範囲は一つのJavaScript実行環境のメモリ内だけであり、認証、別タブの排他、再起動後の復元、車両送信の許可を提供しない。失敗時は現在状態を維持し、検証中の再入を拒否する。実行・保存・UIへ接続する際は別途設計する。

実dispatchはこの単位に続けて追加しない。対象transportの allowlist/専用dispatcher、要求と応答の根拠、適合、precondition、監査保存形式、異常時復旧、独立レビュー、対象実車での試験が個別に揃った後、別レビューで `dispatching` への入口を設計する。公開UIの有効化はさらに別判断とする。

## 消去前記録の調査メモ: 2026-09-06

対象: 3.13.500 / 06e48c41。以下は実コード調査と次回レビュー用の論点であり、承認済みの保存設計・実装ではない。Sol設計依頼は使用量上限で終了し、設計結果を受領できなかった。代替モデルで保存契約を確定せず、本体コードと保存形式は変更していない。

### 現行処理で確認できたこと

- `script.js` の `downloadObdSessionJson()` はエクスポート、サイズ・再取込ポリシー確認、Blob生成、リンクのclickまでを実行する。表示も「JSON保存を開始しました」であり、ファイル保存完了とは主張していない。戻り値trueを消去前保存完了の根拠へ転用しない。
- 事例の `saveCase()` / `persistCases()` は別用途のlocalStorage保存であり、消去前の読取セッションや開始記録の監査保管として接続されていない。事例データへ新しい記録を混ぜない。
- `getDiagnosticSessionJsonPolicy()` は一般テキストや一般scanner JSONも受理し得る。accepted単独では診断セッションの証明にならず、session種別でも実車由来・適合・個人情報除去・読取内容の完全性を証明しない。
- 現行 `buildBridgeSessionExportPayload()` は `bridge_session_export_v1` を生成する。原文の保持が必要な記録を、再正規化して同一だと扱わない。追加保管の上限と再取込互換は、現行4,000,000 byte上限を含め別途確認する。

### 次回Solレビューへ渡す候補

既存の事例保存・エクスポートJSONとは独立したIndexedDB保管部を候補とする。まだDB名、schema、公開API、保存開始のUI、記録の保持・削除方針は確定しない。現行画面のロードや読取だけで自動保存を始めない。

保存対象の境界確認、追加専用のキー重複拒否、書込transactionの完了、別読取transactionによる内容一致確認を分ける。保存後の再読取失敗や期限超過は「保存されていない」と断定せず、確認不能として扱う。自動上書き・削除・再保存で復旧したことにしない。

仕様根拠: [W3C Indexed Database API 3.0](https://www.w3.org/TR/IndexedDB/)。`add()` は重複キーを拒否し、`put()` は置換する。個別requestの成功とtransactionの完了を分ける必要がある。strict durabilityは書込みの耐久性を優先するヒントであり、将来のデータ消去やストレージ故障を防ぐ保証ではない。この保管部だけで実行認証や消去前提条件を満たしたとは扱わない。

### 受入試験の候補（未実施）

| 条件 | 確認すること |
| --- | --- |
| 正常保存と再読込 | transaction完了と読み戻し一致の両方を確認し、元のJSONを変更しない |
| request成功後にtransaction abort | 保存完了を返さず、車両送信0を維持する |
| 重複ID・同時追加 | 既存記録を置換しない。競合した側を新規保存成功としない |
| quota・開く権限拒否・blocked・期限超過 | 有界時間で確認不能を返し、遅れて開いた接続も閉じる |
| 保存後の読取失敗・内容不一致 | 保存確認済みへ進まず、残った記録を勝手に削除しない |
| 型・サイズ・エクスポート種別の不正 | 書込み開始前に拒否。一般テキストをセッションと誤認しない |
| 画面再読込・別の同一originページ | 実IndexedDBで同じ記録が読めることを隔離ブラウザで確認する |
| 従来の事例・JSON入出力 | key/schemaを変更せず、既存データの移行や削除を起こさない |

実装着手条件はSolによる設計・影響範囲レビューの完了。車両との対応付け、実行開始記録、接続世代、消去前後比較は、この保管候補とは別の未完了項目として残る。

## 3.13.501 消去前記録の保管部

上記の使用量上限による停止後、Sol設計レビューを再実行して最小契約案を受領した。今回の対象は保管部だけで、保存開始の画面、消去操作との結合、認証、保持・削除管理は含めない。既存の事例保存・エクスポート形式は変更しない。

`ObdOperationJournal.savePreOperation({ recordId, sessionJson })` と `verifyPreOperation({ recordId, sessionJson })` を独立モジュールに置く。ロード時にはDBを開かず、明示呼出時だけ動作する。DBは `vehicle-diagnosis-operation-journal-v1`、version 1、object storeは `preOperationRecords`。追加のみで、上書き・削除・自動再試行のAPIは公開しない。

保存する情報はrecordId、createdAt、exportType、sourceBytes、byteLength、sha256。正規化し直したJSONではなく、渡されたJSONのUTF-8バイト列を保持する。最大4,000,000 byte、正規のエクスポート外枠と既存のsession JSONポリシーを確認する。ただし内容の真正性、車両適合、網羅性、個人情報除去をこの検査で保証しない。呼出側は事前に利用者確認と保存範囲の確認を実施する必要がある。

保存確認は、追加のreadwrite transactionが完了した後、別readonly transactionで取得した記録のバイト列・長さ・digest・種別・ID等を照合して行う。digestだけの比較では完了扱いしない。strict durabilityを要求するが、将来の削除や破損を防ぐ保証ではない。

createdAtはISO日時文字列、sha256は32byteのArrayBufferとする。保存直後は作成した日時との完全一致も確認する。verifyには期待日時を渡さないため、日時の真正性は保証せず、正規ISO形式と端末現在時刻から60秒先までの範囲だけを確認する。端末時計の変更によっても確認不能になり得る。DBのキー構成や記録の項目集合が異なる場合は、修復・移行せず確認不能とする。

結果のstatusは `confirmed` / `conflict` / `rejected` / `indeterminate`。confirmedもその時点の保存照合だけを表し、消去許可には使わない。期限超過、blocked、読取不能、読取不一致はindeterminateとし、保存されなかったとは断定しない。失敗時も既存記録の削除や上書きで復旧しない。実行・送信・再試行許可は常にfalse。

今回の通常画面からの自動保存・手動保存への接続はない。後続では保存対象と消去前記録IDの対応付け、利用者向けの一覧・エクスポート・削除管理、別タブや再接続時の失効を設計してから操作画面へ接続する。現在のdownload開始通知を保存完了の根拠へ変更しない。

## 3.13.502 保存した記録の読み出し

Sol設計に基づき `ObdOperationJournal.loadPreOperation({ recordId })` を追加する。元のJSONを呼出側が保持していなくても、既存記録をIDで取得するための内部API。save/verifyの返却形式や処理、DB versionと保存schemaは変えない。一覧・削除・通常画面の復元操作・診断セッションへの自動取込は含めない。

既存DBからreadonly transactionで取得し、transaction完了後に記録の項目集合、ID、日時、種別、バイト長、4MB上限、digestの型と長さを確認する。UTF-8を厳密に復号し、再符号化したバイト列との完全一致も確認する。BOMを黙って取り除いた別内容は返さない。現行の保存対象ポリシーを再確認したうえでSHA-256を計算し、保存digestと比較する。取得当時のポリシーでは有効でも、現在のポリシーで拒否される記録は返さない。

成功は `status: "loaded"` / `reason: "valid_record_recovered"` とし、save/verifyのconfirmedと区別する。recordにはID、日時、種別、元のsessionJson、バイト数を不変の値として返す。可変のArrayBufferは公開しない。失敗時のrecordは常にnull。入力不正はrejected、記録不在・破損・DB異常・照合不能・期限超過はindeterminateとし、記録を修復・削除・上書きしない。

DB未作成時は初期化せず、読取完了前や5秒の期限切れ後に内容を返さない。保存内容とdigestを同時に変更できる者への改ざん防止・真正性確認ではなく、ローカルの記録整合性の検査に限る。車両識別、適合、外部に保持した消去前記録との同一性、実行許可の根拠として使わない。

## 3.13.503 保存記録IDの一覧取得

Sol設計に基づき `listPreOperationIds({ limit, afterRecordId })` を追加する。引数はこの2項目のown data propertyだけとし、limitは1から50の整数、afterRecordIdはnullまたは既存のID形式。省略時の補完はしない。prototypeの受付は既存APIと同じくnullまたはその親がnullのものとし、別realmの通常オブジェクトも受け付ける。独自のnull-prototype中間オブジェクトもこの条件に含まれるが、継承値は参照せず、own data値を検証・複写する。DB version・保存schema・save/verify/loadの契約は変更しない。

既存DBのreadonly transactionで `openKeyCursor` を使い、本文・日時・バイト数・digestを読み出さない。afterRecordIdの排他的下限から主キー昇順で最大limit+1件を確認する。余分な1件があればhasMoreをtrueにし、返した最後のIDをnextAfterRecordIdにする。作成日時順ではなく、次のページまで含めた固定スナップショットでもない。並行追加・削除は後続ページに影響し得る。

正常時は `listed / record_ids_listed` と不変のrecordIds配列を返す。transaction完了前に成功を返さず、不正キー・読取失敗・期限超過・異なるDB構造では一覧全体を確認不能にして途中結果を返さない。失敗時はrecordIdsが空、nextAfterRecordIdがnull、hasMoreがfalseとなる。DBがなければupgradeを中断し、初期化しない。書込・移行・削除・自動再試行は行わない。

IDは未検証の参照であり、記録内容は `loadPreOperation` の検査を通して取得する。一覧にある記録でも破損・現在のポリシーへの不適合で読み出せない場合がある。ID自体にも機微情報を含めない呼出側設計が必要。通常画面・認証・対象車両照合・消去処理には接続せず、実行関連の許可はすべてfalseのままとする。

## 3.13.504 開発画面の記録閲覧

開発・詳細画面の「消去前の保存記録」に一覧取得と検証済み内容の閲覧だけを接続する。診断画面と詳細機能の両ロック解除、OBDタブ・詳細モード・詳細ステージ・閲覧欄が開いていることを確認し、明示操作で20件ずつ取得する。最初の記録を自動で開かず、現在の一覧内IDを選択した場合だけ読み出す。記録ID・日時・サイズを表示し、本文は「記録データ」に折りたたむ。

アクセスロック・詳細ロック・タブ変更・モード変更・詳細ステージ離脱・閲覧欄を閉じる操作で世代番号を更新し、一覧と本文を消す。非同期取得後にも有効条件と世代を再確認する。表示値はtextContentで扱い、保存JSONの内容をHTMLとして解釈しない。既存の診断セッション、診断入力、JSON入出力、送信許可は変更しない。

この画面は既存記録の閲覧用であり、消去前記録を新規作成する操作はまだない。保管未作成と取得失敗を区別し、記録がない端末を破損と断定しない。ブラウザ内のロックは同一originのスクリプト実行権限を持つ者に対する隔離境界ではなく、APIやIndexedDBへの直接アクセスを暗号学的に防止する仕組みではない。

## 3.13.505 選択記録のJSON出力

Sol設計に基づき、閲覧欄の選択記録だけを明示操作でダウンロードする。表示とクリックの両方で閲覧有効条件、取得処理中でないこと、選択IDが現在一覧に属すること、ID形式と本文の文字列型を確認する。既存の読み出しで検証したsessionJsonをそのままUTF-8のBlobに渡し、現在診断から再構築したりJSONを再整形したりしない。

ファイル名は検査済みIDに基づく `pre-operation-record-ID.json`、MIMEは `application/json;charset=utf-8`。一時リンクを除去し、Blob URLを解放する。開始通知は端末保存完了の証拠ではない。失敗時は元の閲覧記録を保持し、保存済みや車両操作許可に変更しない。すでに開始したブラウザのダウンロードは後からの画面ロックで取り消せる保証がない。端末内保管部への新規保存・削除、JSONの診断への取込、車両操作には接続しない。

## 3.13.506 現在の読取結果の保管

Sol設計に基づき、開発画面の閲覧欄から現在の読取結果を追加保存する。現在セッションの参照と出力日時を固定し、既存export builderへ浅いwrapperを渡してJSONを作る。元セッションは変更しない。形式・現行JSONポリシー・サイズを確認した後、端末内保管と識別情報の扱い、車両操作を行わないことを利用者に確認する。確認後に同じセッション参照、同じ出力日時でのJSON完全一致、閲覧世代、ロック・画面・通信状態を再検査する。

保存専用の遮断条件には既存export条件に加え、全disconnect操作とpending write/commandを含める。確認中の結果変更や読取開始では保存しない。全検査後に暗号乱数16byteから不透明なIDを生成し、savePreOperationへ一度だけ渡す。車両情報や時刻をIDへ含めない。初期化・通信・読取・取込中には開始せず、同時保存・自動再試行・自動一覧更新も行わない。

保存中と直近結果は閲覧の一時stateと分離し、画面を閉じたりロックしたりしても同一ページ内で保持する。非表示中は結果IDをDOMへ描画せず、再度権限を満たして開いた時に表示する。開始後の保管は画面ロックでは取り消せない。ページ終了を越える実行・結果表示の保証はない。

confirmedは対応するIDのローカル保存照合だけを表す。応答不正・Promise失敗・indeterminateは保存された可能性があるものとして扱い、IDを残す。確認不能後の別ID保存は、重複可能性への明示確認を一回の試行で消費する。既存の未保存警告・置換確認・ダウンロード状態・診断結果・車両送信許可は変えない。記録の保持期限・削除管理・別タブ排他・車両適合確認を完了した意味ではない。

## 3.13.507 保管直後の記録を開く

Sol設計に基づき、引数を受け取らない専用操作で、同一ページ内の直前のconfirmedな保管IDを読み出す。記録を一覧へ挿入せず、recordIdsとページの意味を維持する。開く操作も既存loadPreOperationを通し、画面世代・現在の確定ID・返却ID・読取成功を照合する。保存中・一覧や記録の読込中・成否不明・ロック・画面離脱時には開始しない。

選択の出所をlistとconfirmed-saveに分ける。通常の一覧からの読込は一覧内ID条件を変更しない。出力も出所別に条件を再検査し、confirmed-saveは現在の確定IDとの一致を要求する。新たな保存の確認開始時には前回の保管結果由来の選択を消す。自動読込、新たな書込、診断への取込、ページ再読込を越える直前IDの保持は追加しない。
