# ECU応答の追加識別別名チェック

2026-10-13 / 旧版3.13.689・e6d2c7e565c853021aec8ab21beaee63ec0c787c / 承認後3.13.690へ適用

## 再現

normalizeEcuResponseSummaryはecuId/ecu_id、moduleId/module_id、controllerId/controller_idをECU識別に使用する。各組の片方が空文字で、もう片方が7E8の入力では、3.13.689本体はreportedの行を残し、ecuResponseConflictを付けない。異なる非CAN文字列、0x接頭辞やゼロ埋めの差も同様。sourceEcu/source_ecuは3.13.688で検査済みだが、残りの3組には同じ検査がない。

## 適用した変更

scripts/ecu-identity-alias-proposal.jsに保存した案を承認後、本体へ適用した。対象関数の既存sourceEcu/source_ecu検査直後へ3組の検査を足す。旧提案ヘルパーは本体から読み込まない。

同じ行・同じ組の両方がnull/欠落以外の場合に、非文字列・空文字・前後空白と大小文字を除いた不一致を矛盾とする。片方だけ、null、同じ文字列、空白/大小文字差だけの記録は新しく除外しない。既存のCAN識別矛盾検査は維持する。

重要な採用条件の変更: 0x7E8/7E8、008/8は数値上同じCAN番号でも、新たに適合判定の根拠対象外になる。自動で同一表記へ補正しない。

矛盾行へ既存ecuResponseConflict/ecu_response_conflict:trueとapplicabilityEvidenceEligible/applicability_evidence_eligible:falseを付ける。別ECUの正常行は維持。同じ識別・内容の重複行が既存ルールで統合される場合は、順序によらず統合行へ矛盾を保持する。元のreported状態・値・件数・応答時間・入力は保持し、記録削除やblocked化はしない。既存集約処理による方向別アドレス4項目のnull追加も差分として扱う。

## 隔離検証の記録

3組を同じケース群で比較する71ケースを用意した。3.13.689本体のAPI出力全文とAPI/セッション/保存/復元の固定SHA256をfixtures/ecu-identity-alias-legacy-3.13.689.jsonへ保存し、上書きしない。変更36ケースは既存フラグ・方向別null項目以外の全文保持を検証し、変更しない35ケースは4種類の出力ハッシュを比較する。配列/data包装、重複行の前後、空配列型、正常な別ECU行を含む。

実ブラウザーは隔離ソースだけに修正案を適用。正規化後の合成JSONを実ファイル取込し、3組の矛盾注記、正常行表示、reported保持、検索/解除、保存復元後の全行フラグ、390/1280px明暗、横溢れなしを確認。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/ecu-identity-alias-proposal-wECoD0。390pxを目視確認。生の別名矛盾JSONを通常取込で拒否する試験ではない。

## 対象外と適用判断

任意metadata、外側のこれら3組、異なる組同士（ecuIdとmoduleId等）の比較、方向別アドレスの別名、親子/別行間の比較、既に失われた情報の復元は追加しない。他のAPIすべての別名検査を保証するものではない。

開発計画の「診断結果の契約・保存形式に変更が必要なら、その具体的な差分を先に提示する」に沿って、本体へ適用する前に変更する採用条件を提示し、ユーザーの「続けて」を受けて3.13.690へ適用した。保存schema・通信権限は維持する。追加機材は不要。全体回帰・配布再生成は下記へ記録する。

隔離検証結果: 71ケース・859項目が合格。既存の識別根拠resolverが矛盾行をconflictと扱うこと、独立した正常ライブ14 Vの保持も確認した。隔離検証時点では本体と表示資産のGit差分は0。

## 本体適用の検証（3.13.690）

71ケース・575項目が合格。旧版再実行284項目を除き、固定fixtureとの比較を残して本体を直接検証し、全体OBD回帰へ組み込んだ。変更対象36ケースは既存フラグ・方向別null項目以外の全出力保持、35ケースはAPI/セッション/保存/復元の固定ハッシュ一致を確認。入力・正常別ECU行・独立した14 Vライブ値を保持し、識別根拠resolverのconflict判定と非送信を確認した。

実ブラウザーも本体を直接読み込み、合成JSON取込、3組の矛盾注記、正常行、検索/解除、reported保持、保存復元後の全行フラグ、390/1280px明暗が合格。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/ecu-identity-alias-production-76ven2。390pxを目視確認。実車適合の証明ではない。

診断画面全体のブラウザー回帰が合格（readiness-review-oDCWdQ）。ZIP: C:/Users/nagatomo/AppData/Local/Temp/vehicle-diagnosis-tool-3.13.690.zip、2,702,768 bytes、SHA256 351BCEA8E136FE27F9BC54BC7BA7ECE4832D021206BBD3834CBDFB0F29C11B25。別展開851ファイル / 17,038,149 bytesの整合性合格。主要5資産は本体/別展開/ローカルHTTP200で全文一致。

ブリッジ384・オフライン183・Windowsローカル1,369・パッケージ766項目、データ203 JSON / DTC3,878件はエラー0。表示回帰は通信経路74・識別矛盾32・Readiness26・FF7・Mode06 7・検索6項目が合格。DTC定義の集計レポートも正常終了した。

全体OBD7,447項目はエラー0で終了。専用71ケース・575項目も全体回帰の入口で実行した。実車・VCIへの通信は行っていない。

実装コミットa8fec80d573ab267ad1685817ac3ff0430ef70a4の本番dpl_4mNqaV3RHDuZMcGsV41krfrHft5bがREADY。tool.mukiguri.comへの割当と主要5資産の公開HTTP200・LF正規化後の本体全文一致を確認。
