# ECU応答一覧の外側識別矛盾を伝える案

2026-10-13 / 旧版3.13.686・f241b59e75a19dcec60198134970d4522c4978ba / 承認後3.13.687へ適用

## 再現

normalizeEcuResponseSummary({sourceEcu:'7E8',source_ecu:'7E9',ecus:[正常行2件]})では、外側の矛盾が正規化後に消え、両行がreportedで識別矛盾フラグなしとなる。同じ矛盾を各行に記録した場合の既存フラグとは異なる。data包装の外側とdata自体でも再現した。合成入力のみで、通常JSON取込入口の拒否や実車を試したものではない。

## 具体的な変更

scripts/ecu-envelope-alias-proposal.jsに保存した差分を承認後、本体へ適用した。normalizeEcuResponseSummaryの入口でinputとinput.dataの2オブジェクトのみを確認し、それぞれのsourceEcu/source_ecuを既存同義項目チェッカーへ渡す。両方がnull/欠落以外の場合、非文字列・空文字・前後空白/大小文字を除いた不一致を矛盾とする。片方だけの値、親子間の異なるECU番号はこの判定で拒否しない。

矛盾があれば、選ばれた一覧の全行へ既存ecuResponseConflict/ecu_response_conflict:true、applicabilityEvidenceEligible/applicability_evidence_eligible:falseを付ける。正常な別ECUの行も同じ一覧に含まれていれば対象外となる。個別行の既存識別判定は維持する。

- 行、ECU番号、reported等の元状態、件数、応答時間、合計、元入力を維持する。値を捨てる全体拒否やblockedへの書換えではない。
- 既存の矛盾行の集約処理により、未指定のdiagnosticRequestId/diagnostic_request_id/diagnosticResponseId/diagnostic_response_idはnullとして現れる。この4項目の差分も検証した。指定済みの方向別アドレスを補完・推定しない。
- 現行3.13.686の詳細表示で矛盾注記を表示し、既存の保存・復元でフラグを維持する。schemaの版は変更しない。
- 別途セッションへ渡した正常ライブは維持する。送信/実行フラグはfalseを維持。

## 隔離検証

14ケース・180項目が合格。旧版14ケースのAPI出力/セッション/保存/復元を固定SHA256へ保存し、本体が固定結果と一致することを先に確認した。変更対象5ケースは全行へのフラグ、既存識別根拠resolverのconflict判定、既存の空方向別項目、保存復元、非送信を確認。変更対象外9ケースは4種類の全出力が旧版と一致。元入力不変と別途正常ライブ14 V保持も確認した。旧版fixtureは上書き不可。

実ブラウザーでは修正済みソースを隔離経路でのみ読み込み、正規化後の合成JSONを実ファイル取込した。両行の矛盾注記、検索/解除、元状態reported、保存復元、390/1280px明暗、横溢れなし、例外/外部/車両要求0が合格。成果物: C:/Users/nagatomo/AppData/Local/Temp/ecu-envelope-alias-proposal-UhZRQr。390pxを目視確認。

## 対象外と限界

metadata等の任意入れ子、各行の空文字同義項目、他別名、親子/行間のECU差、既に失われた外側矛盾は今回の対象外。空一覧では対象行がなく、一覧そのものの拒否理由を新設しない。表示状態reportedは取得記録として保持されるため、一覧全体の読取拒否とは表示しない。完全な全経路の適合判定保証ではなく、現在の識別根拠resolverとフラグの保存復元までの隔離検証。全体回帰と配布再生成の結果は下記へ記録する。

## 適用確認

同じ一覧に含まれる正常行も適合判定の根拠対象外になるため、診断結果の採用条件が変わる。開発計画の「診断結果の契約・保存形式に変更が必要なら、その具体的な差分を先に提示する」に従い、具体案を提示し、ユーザーの「続けて」を受けて本体へ適用した。

## 本体適用の検証（3.13.687）

14ケース・124項目が合格。本体を直接読み込み、旧版fixtureを変更せず正常出力と比較する。旧版ソースの再実行56項目を除き、隔離パッチ依存を外して全体OBD検証へ組み込んだ。実ブラウザーも本体を直接読み込み、合成JSON取込、両行の矛盾注記、検索/解除、保存復元、390/1280px明暗が合格。元のreported状態、行と値、別途正常ライブ14 Vを保持する。ページ例外/外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/ecu-envelope-alias-production-weLrW8。390pxを目視確認。

診断画面全体のブラウザー回帰が合格（readiness-review-ckzoBe）。ZIP: C:/Users/nagatomo/AppData/Local/Temp/vehicle-diagnosis-tool-3.13.687.zip、2,702,524 bytes、SHA256 7B06961B3597141A5CFECA04C104477A1F01E13445C9BC54386D76CC1C3AF737。別展開851ファイル / 17,036,843 bytesの整合性合格。主要5資産は本体/別展開/ローカルHTTP200で全文一致。実車適合の証明ではない。

ブリッジ384・オフライン183・Windowsローカル1,369・パッケージ766項目、データ203 JSON / DTC3,878件はエラー0。表示単体の専用32・Readiness26・FF7・Mode06 7・検索6項目も合格。

全体OBD7,447項目・エラー0・終了コード0（obd-3.13.687.log）。通常のセッション・テキスト/CSV/JSON・ブリッジ経路を含む既存回帰が合格。

実装コミット8fe56b7d51e7b03f082d89882cfe43e945c8f82fの本番dpl_CuhpvHiAR5tj2sditFAqXyw2JrcLがREADY。tool.mukiguri.comへの割当と主要5資産の公開HTTP200・LF正規化後の本体全文一致を確認。
