# R2 比較用の最小証拠情報: 非送信の設計案

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
