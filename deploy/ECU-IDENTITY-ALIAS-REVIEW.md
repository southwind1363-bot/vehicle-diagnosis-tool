# ECU応答の追加識別別名チェック案

2026-10-13 / 本体3.13.689・e6d2c7e565c853021aec8ab21beaee63ec0c787c / 本体未適用

## 再現

normalizeEcuResponseSummaryはecuId/ecu_id、moduleId/module_id、controllerId/controller_idをECU識別に使用する。各組の片方が空文字で、もう片方が7E8の入力では、現行本体はreportedの行を残し、ecuResponseConflictを付けない。異なる非CAN文字列、0x接頭辞やゼロ埋めの差も同様。sourceEcu/source_ecuは3.13.688で検査済みだが、残りの3組には同じ検査がない。

## 具体案

scripts/ecu-identity-alias-proposal.jsは、対象関数の既存sourceEcu/source_ecu検査直後へ3組の検査を足す。本体からは読み込まない。

同じ行・同じ組の両方がnull/欠落以外の場合に、非文字列・空文字・前後空白と大小文字を除いた不一致を矛盾とする。片方だけ、null、同じ文字列、空白/大小文字差だけの記録は新しく除外しない。既存のCAN識別矛盾検査は維持する。

重要な採用条件の変更: 0x7E8/7E8、008/8は数値上同じCAN番号でも、新たに適合判定の根拠対象外になる。自動で同一表記へ補正しない。

矛盾行へ既存ecuResponseConflict/ecu_response_conflict:trueとapplicabilityEvidenceEligible/applicability_evidence_eligible:falseを付ける。別ECUの正常行は維持。同じ識別・内容の重複行が既存ルールで統合される場合は、順序によらず統合行へ矛盾を保持する。元のreported状態・値・件数・応答時間・入力は保持し、記録削除やblocked化はしない。既存集約処理による方向別アドレス4項目のnull追加も差分として扱う。

## 検証範囲

3組を同じケース群で比較する71ケースを用意した。現行本体のAPI出力全文とAPI/セッション/保存/復元の固定SHA256をfixtures/ecu-identity-alias-legacy-3.13.689.jsonへ保存し、上書きしない。変更36ケースは既存フラグ・方向別null項目以外の全文保持を検証し、変更しない35ケースは4種類の出力ハッシュを比較する。配列/data包装、重複行の前後、空配列型、正常な別ECU行を含む。

実ブラウザーは隔離ソースだけに修正案を適用。正規化後の合成JSONを実ファイル取込し、3組の矛盾注記、正常行表示、reported保持、検索/解除、保存復元後の全行フラグ、390/1280px明暗、横溢れなしを確認。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/ecu-identity-alias-proposal-wECoD0。390pxを目視確認。生の別名矛盾JSONを通常取込で拒否する試験ではない。

## 対象外と適用判断

任意metadata、外側のこれら3組、異なる組同士（ecuIdとmoduleId等）の比較、方向別アドレスの別名、親子/別行間の比較、既に失われた情報の復元は追加しない。他のAPIすべての別名検査を保証するものではない。

開発計画の「診断結果の契約・保存形式に変更が必要なら、その具体的な差分を先に提示する」に沿って、本体へ適用する前に変更する採用条件を提示する。今回の継続では隔離案と検証のみを保存し、既存本体・保存schema・通信権限は維持する。追加機材は不要。全体回帰・配布再生成は本体適用時に行う。

最終結果: 71ケース・859項目が合格。既存の識別根拠resolverが矛盾行をconflictと扱うこと、独立した正常ライブ14 Vの保持も確認した。本体と表示資産のGit差分は0。
