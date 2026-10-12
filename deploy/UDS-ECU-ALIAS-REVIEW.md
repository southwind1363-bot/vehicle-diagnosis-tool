# UDS専用9 APIのECU同義項目チェック案

2026-10-12 / 対象3.13.681・d1707ba080d4dcbac4cb846fea8c731d07979f17 / 本体未適用

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

## 本体へ適用する具体案

9入口で既存hasConflictingJsonEcuAliasesを使う。同じオブジェクトのsourceEcu/source_ecuが両方null/欠落以外の場合、非文字列・空文字・前後空白/大小文字を除いた不一致を拒否する。未使用メタデータ・子要素の矛盾も含め、対象応答全体を不採用にする。

- FFの2 APIは既存normalizeBridgeFreezeFrameSnapshot、残り7 APIはnormalizeBridgeDtcSnapshotの空拒否応答を返す。状態blocked・理由source_ecu_alias_conflict。nullや新たな例外を返す方式ではない。
- DTC、UDS記録、RAW、サブ機能、ECU、時刻、プロトコル等の元情報を引き継がず、正常行の部分採用もしない。元の入力引数は変更しない。
- セッションに別途渡す正常読取は保持する。同じ欄の以前の記録を自動保持する契約ではない。呼出側が戻り値を採用した欄は拒否記録となる。
- 正常応答、片方だけのECU指定、同値・空白大小文字違い、null、ECUなし、短い応答の既存結果を維持する。空の正常応答を拒否と取り違えない。
- 既存の日本語拒否表示を利用する。保存schema、通信・書込権限は変更しない。

## 隔離検証

scripts/uds-ecu-alias-proposal.jsがソース文字列にだけ修正を適用する。本体obd-readonly.jsとscript.jsは変更しない。

- 単体比較234ケース・2,430項目合格。18応答パターン×13条件。固定時刻1791712800000。旧版のAPI出力・セッション・保存・復元の全SHA256を固定し、正常入力は全結果一致、拒否出力は既存空拒否との全体一致を検査した。
- 各9 APIの拒否結果と別途正常ライブ14 Vを同梱し、保存復元後も正常ライブを保持することを検査する。
- 隔離ブラウザー11記録（9 API拒否＋前後の正常UDS DTC）が合格。実ファイル取込・概要への移動・拒否理由・保存復元・390/1280px明暗・正常復帰を確認。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/uds-ecu-alias-proposal-V9pHaK。390pxの拒否カード画像も目視確認。

## 残る境界

汎用正規化API、他のECU別名ecu/address/module、別オブジェクトや親子の明示的なECU差、循環参照/getterの下流動作、既に失われた矛盾の復元は対象外。上位統合APIは既存の全体拒否を維持する。この案で全入口を保護したとは扱わない。

診断結果の採用条件を変更するため、開発計画の「診断結果の契約・保存形式に変更が必要なら、その具体的な差分を先に提示する」に従って適用確認を待つ。本体・公開版・配布ZIPは3.13.681のまま。
