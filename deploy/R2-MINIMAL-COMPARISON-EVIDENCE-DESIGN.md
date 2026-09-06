# R2 比較用の最小証拠情報: 非送信の設計案

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
