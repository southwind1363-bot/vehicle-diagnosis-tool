# UDS専用9 APIのECU同義項目チェック（3.13.682適用）

2026-10-12 / 対象3.13.681・d1707ba080d4dcbac4cb846fea8c731d07979f17 / 利用者の「続けて」で承認・3.13.682本体適用済み

## 対象と再現

前回の6読取12 APIとは別のUDS専用デコーダーを点検。同じ入力のsourceEcu/source_ecuが矛盾していても片方へ揃えて解析する入口が残る。既存回帰検査から選んだ合成応答を使い、旧本体の結果をscripts/fixtures/uds-ecu-alias-legacy-3.13.681.jsonへ固定した。18応答パターンのsourceEcu:7E8/source_ecu:7E9は、すべてsourceEcu:7E9・reportedとなることを再現した。規格適合や実車で取得した応答の証明ではない。

| API（decodeUds…Response） | 応答例のサブ機能 | 返却先 |
| --- | --- | --- |
| DtcSnapshot | 03 / 04 / 18 | FF |
| DtcStoredData | 05 | FF |
| DtcExtendedData | 06 / 10 / 19 | DTC |
| DtcExtendedDataByRecordNumber | 16 | DTC |
| DtcFaultDetectionCounter | 14 | DTC |
| DtcSeverity | 08 / 09 | DTC |
| WwhObdDtc | 42 | DTC |
| WwhObdPermanentDtc | 55 | DTC |
| DtcReadinessGroup | 56 | DTC |

## 採用した変更

9入口で既存hasConflictingJsonEcuAliasesを使う。同じオブジェクトのsourceEcu/source_ecuが両方null/欠落以外の場合、非文字列・空文字・前後空白/大小文字を除いた不一致を拒否する。未使用メタデータ・子要素の矛盾も含め、対象応答全体を不採用にする。

- FFの2 APIは既存normalizeBridgeFreezeFrameSnapshot、残り7 APIはnormalizeBridgeDtcSnapshotの空拒否応答を返す。状態blocked・理由source_ecu_alias_conflict。nullや新たな例外を返す方式ではない。
- DTC、UDS記録、RAW、サブ機能、ECU、時刻、プロトコル等の元情報を引き継がず、正常行の部分採用もしない。元の入力引数は変更しない。
- セッションに別途渡す正常読取は保持する。同じ欄の以前の記録を自動保持する契約ではない。呼出側が戻り値を採用した欄は拒否記録となる。
- 正常応答、片方だけのECU指定、同値・空白大小文字違い、null、ECUなし、短い応答の既存結果を維持する。空の正常応答を拒否と取り違えない。
- 既存の日本語拒否表示を利用する。保存schema、通信・書込権限は変更しない。

## 適用前の隔離検証

適用前はscripts/uds-ecu-alias-proposal.jsでソース文字列にだけ修正を適用し、本体を変更せずに検証した。

- 単体比較234ケース・2,430項目合格。18応答パターン×13条件。固定時刻1791712800000。旧版のAPI出力・セッション・保存・復元の全SHA256を固定し、正常入力は全結果一致、拒否出力は既存空拒否との全体一致を検査した。
- 各9 APIの拒否結果と別途正常ライブ14 Vを同梱し、保存復元後も正常ライブを保持することも検査した。
- 隔離ブラウザー11記録（9 API拒否＋前後の正常UDS DTC）が合格。実ファイル取込・概要への移動・拒否理由・保存復元・390/1280px明暗・正常復帰を確認。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/uds-ecu-alias-proposal-V9pHaK。390pxの拒否カード画像も目視確認。

## 残る境界

汎用正規化API、他のECU別名ecu/address/module、別オブジェクトや親子の明示的なECU差、循環参照/getterの下流動作、既に失われた矛盾の復元は対象外。上位統合APIは既存の全体拒否を維持する。この案で全入口を保護したとは扱わない。

## 本体適用と検証

利用者の承認後、確認済みの9 API入口検査を3.13.682へ適用。既存の日本語拒否表示と保存schemaを維持。隔離パッチ参照を検証から除き、本体を直接検査する。固定旧版fixtureは変更しない。

- 本体234ケース・2,196項目合格。隔離検証2,430項目から旧版再現234項目を除いた。本体の正常出力/セッション/保存/復元の全SHA256比較と、9 APIの拒否結果に別途正常ライブ14 Vを同梱する36項目を維持。
- 本体ブラウザー11記録が合格（uds-ecu-alias-production-tbO4LW）。実取込・拒否理由・保存復元・390/1280px明暗・正常復帰を確認。ページ例外・外部/車両要求0。390px拒否表示も目視確認。前回6読取12 APIのブラウザー回帰も合格（core-readout-ecu-alias-production-F3hxoj）。
- ZIP別展開851ファイル / 16,988,699 bytes一致。ZIP自体2,700,316 bytes、SHA256: 12AB9452FFBC2746FBA8958D43D3CA231E549BCABA189F079D12DB6BE029DFD2。
- 主要5資産は本体・別展開・ローカルHTTP200でLF正規化後の全文一致。
- ブリッジ384・オフライン183・Windowsローカル版1,369・パッケージ766項目が合格。データ203 JSON / DTC3,878件はエラー・警告0。
- 診断画面全体のブラウザー回帰が合格（readiness-review-w76VAY）。実取込・検索・初期化・移動・画面幅/明暗・記録維持を確認。外部/車両要求0。
- 全体OBD回帰7,447項目・エラー0で合格。実装コミットa902136d7279764ead729c693f6d646594d2231aの本番dpl_87u1W7sQy6HMBZdofMxWsWNWTg99がREADY。tool.mukiguri.comへの割当と、主要5資産の公開HTTP200・LF正規化後の本体全文一致を確認。実車/VCI試験ではない。
