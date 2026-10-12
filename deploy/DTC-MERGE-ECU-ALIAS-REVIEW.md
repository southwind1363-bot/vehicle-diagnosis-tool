# DTC統合APIのECU同義項目チェック案

2026-10-13 / 旧版3.13.684・07d37c55852ce3dbd0cf55368c22e132547524af / 承認後3.13.685へ適用

## 再現と対象

対象は公開API mergeDtcSnapshots(...snapshots)。reportedのDTC記録へsourceEcu:7E8/source_ecu:7E9とP0300を同梱すると、旧版本体はreportedのままP0300を返す。別の正常記録P0420も渡した場合、順序にかかわらず両コードを残すことを再現した。状態を持たない生の最小入力ではunknownとなったため、その試行をreported再現の根拠にしていない。すべて合成入力で実車試験ではない。

## 本体へ適用する具体案

入口で全引数を既存hasConflictingJsonEcuAliasesへ渡す。同じオブジェクトのsourceEcu/source_ecuが両方null/欠落以外の場合、非文字列・空文字・前後空白/大小文字を除いた不一致を拒否する。DTC行、メタデータ、data内の矛盾も検査する。

- 1つでも矛盾があれば、その呼出しのDTC統合全体を不採用にする。正常な別引数のDTCも部分採用しない。前後の順序で結果を変えない。
- 既存normalizeBridgeDtcSnapshotの空拒否応答を返す。状態blocked・理由source_ecu_alias_conflict。コード、ECU、時刻、経路、プロトコル、元メタデータなどを引き継がず、引数は変更しない。nullや新しい例外は返さない。
- 呼出側が戻り値を採用したDTC欄は拒否記録となる。以前の同じ欄を自動保持しない。セッションへ別途渡した正常なライブ等は保持する。
- 矛盾のない複数ECU、重複、空入力、空白大小文字・null・別オブジェクトのECU差は従来どおり。既に正規化されたblocked記録と正常記録の統合も、矛盾した同義項目が残っていない限り従来どおり。この変更で既存blocked一般の統合契約までは変えない。
- 既存の日本語拒否表示を使い、保存schema・通信権限は維持する。

## 隔離検証

scripts/dtc-merge-ecu-alias-proposal.jsでソース文字列だけに修正を適用した当初の隔離検証。現在は承認後、本体へ同じ3行を適用した。旧版の出力をscripts/fixtures/dtc-merge-ecu-alias-legacy-3.13.684.jsonへ固定。固定時刻1791712800000。

- 18ケース・208項目合格。正常入力のAPI出力・セッション・保存・復元は全SHA256が旧版と一致。拒否出力は既存空拒否と全SHA256一致。
- 拒否記録の状態・理由・コードなし、保存復元後の送信/書込false、元引数不変を確認。別途正常ライブ14 Vを同梱する4項目も合格。
- 実ブラウザー5記録（単独矛盾、正常→矛盾、矛盾→正常の3拒否＋前後の正常記録）が合格。実ファイル取込、日本語拒否理由、保存復元、390/1280px明暗、正常復帰を確認。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/dtc-merge-ecu-alias-proposal-m5MDrP。390pxの混在入力拒否表示も目視確認。

## 適用境界

ECU応答一覧normalizeEcuResponseSummary、個別行の他API、ecu/address/module等の別名、親子/別引数の明示的なECU差、循環参照/getterの下流動作は今回の対象外。既に失われた矛盾は復元できない。呼出元は基本/ブリッジ/JSONセッション、解析統合、テキスト/CSV取込、Web Serialで利用される。既存呼出元を全体回帰と画面検証の対象にする。

診断結果の採用条件が変わり、同じ統合に渡した正常DTCも不採用となるため、開発計画の「診断結果の契約・保存形式に変更が必要なら、その具体的な差分を先に提示する」に従って具体案を提示し、ユーザーの「続けて」を受けて本体へ適用した。

## 本体適用の検証（3.13.685）

本体を直接読み込む18ケース・190項目が合格。隔離パッチ依存を外し、旧版fixtureは変更せず、全体OBD検証へ組み込んだ。実ブラウザー5記録、日本語拒否理由、保存復元、390/1280px明暗、正常復帰が合格。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/dtc-merge-ecu-alias-production-qweMiU。390px混在拒否表示を目視確認。

ブリッジ384・オフライン183・Windowsローカル1,369・パッケージ766項目が合格。データ203 JSON / DTC3,878件はエラー・警告0。診断画面全体の回帰も合格（C:/Users/nagatomo/AppData/Local/Temp/readiness-review-58pR5L）。

最初の全体OBD検証はscript.jsの改行変換により既存検証のソース抽出で停止した。元のLFへ戻し、停止箇所39項目を単独確認後、全体を再実行した。診断処理変更は承認済み3行のみ。配布物も修正後に再生成した。

最終ZIP: C:/Users/nagatomo/AppData/Local/Temp/vehicle-diagnosis-tool-3.13.685-final.zip（2,702,312 bytes、SHA256 32925DDA9BC454FF803B59826A24B11ADA1913159B7F64C297BE4BF910B82CCC）。別展開851ファイル / 17,036,081 bytesの整合性合格。主要5資産は本体・別展開・ローカルHTTP200の全文が改行も含め一致。これはコピー整合性であり、実車/VCI適合の証明ではない。

全体OBD再実行は7,447項目・エラー0、終了コード0（obd-3.13.685-rerun.log）。旧版fixtureは変更せず、全呼出元を含む既存回帰を通過。

実装コミット065d14c2cae9abcf1ef91aa4a5f6265b56eecb6eの本番dpl_JxaxCFiti2VAVLcSkYoWXxV7H68JがREADY。tool.mukiguri.comへの割当と主要5資産の公開HTTP200・LF正規化後の本体全文一致を確認。
