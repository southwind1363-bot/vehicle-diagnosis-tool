# 対応PID一覧APIのECU同義項目チェック（3.13.684適用）

2026-10-13 / 対象3.13.683・a63a06b7e0eaf05a3d95026555d2c93e8b310426 / 利用者の「続けて」で承認・3.13.684本体適用済み

## 再現

buildSupportedPidMatrixへsupported_pids:[01,0C]とsourceEcu:7E8/source_ecu:7E9を同梱すると、現行はsourceEcu:7E9・reportedで両PIDを返す。配列直接入力の行に矛盾を含めてもreportedとなりPIDを採用する。いずれも合成入力の再現で、実車試験ではない。

## 採用した変更

対象はbuildSupportedPidMatrixの1 API。入口で既存hasConflictingJsonEcuAliasesを使い、入力全体を走査する。同じオブジェクトのsourceEcu/source_ecuが両方null/欠落以外の場合、非文字列・空文字・前後空白/大小文字を除いた不一致を拒否する。

- data包絡、配列直接入力、PID行、未使用メタデータの矛盾も対象とする。矛盾があれば対象入力全体を不採用とし、正常な同梱行も部分採用しない。
- 既存normalizeBridgeSupportedPidSnapshotの空拒否応答を返す。状態blocked・理由source_ecu_alias_conflict。対応PID、ECU、経路、時刻、ページ情報や元メタデータは引き継がない。元入力は変更しない。
- 橋渡し先から一覧APIへ戻る入力に矛盾は含まれず、拒否を繰り返さない。nullや新しい例外を拒否形式にしない。
- セッションに別途渡した正常な他読取は保持する。以前の同じ欄を自動保持する契約ではなく、呼出側が戻り値を採用した対応PID欄は拒否記録になる。
- 正常なオブジェクト/配列/行、空配列、同値・空白大小文字・片方指定・nullの既存出力を維持。別オブジェクト・親子・別PID行の異なるECUは、この同義項目チェックでは矛盾と扱わない。
- 保存schema・通信権限は維持し、既存の日本語拒否表示を使用する。

## 適用前の隔離検証

適用前はscripts/pid-matrix-ecu-alias-proposal.jsでソース文字列だけに変更を適用し、本体を変更せず検証した。旧版の出力をscripts/fixtures/pid-matrix-ecu-alias-legacy-3.13.683.jsonへ固定。固定時刻1791712800000。

- 21ケースと24呼出元出力、計253項目が合格。元入力不変、既存空拒否との全出力SHA256一致、拒否理由・ECUなし・保存復元後の送信/書込falseを確認。
- 正常入力はAPI出力・セッション・保存・復元の全SHA256が旧版と一致。対応PIDの既存デコーダー/ブリッジ24入力の全出力も旧版と一致。この入力群以外の全呼出し状況まで保証するものではない。
- 拒否記録と別途正常ライブ14 Vを同梱し、保存復元後も正常ライブを保持する4項目が合格。
- 実ブラウザー5記録（通常オブジェクト・配列・混在行の拒否3種＋前後の正常記録）が合格。実ファイル取込、概要の日本語拒否理由、保存復元、390/1280px明暗、正常復帰を確認。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/pid-matrix-ecu-alias-proposal-CnFvi8。390pxの拒否表示も目視確認。

## 適用境界

個別行の他API、ecu/address/module等の別名、別オブジェクト間のECU差、循環参照/getterの下流動作は対象外。既に失われた矛盾は復元できない。

## 本体適用と検証

利用者の承認後、確認済みの対応PID一覧API入口検査を3.13.684へ適用。既存表示と保存schemaを維持。隔離パッチ参照とfixture生成処理を検査から外し、本体を直接検査する。固定旧版fixtureは変更しない。

- 本体21ケース・24呼出元出力、計232項目合格。隔離時253項目から旧版再現21項目を除き、本体直接参照へ移行。固定fixtureは維持。
- 本体ブラウザー5記録が合格（pid-matrix-ecu-alias-production-gfFvdb）。日本語拒否理由・保存復元・390/1280px明暗・正常復帰を確認し、ページ例外・外部/車両要求0。390px画面も目視確認。
- 既存汎用5 API（generic-ecu-alias-production-GE3oAv）と基本読取12 API（core-readout-ecu-alias-production-IlFSd2）のブラウザー回帰も合格。
- ZIP別展開851ファイル / 16,989,913 bytes一致。ZIP自体2,700,634 bytes、SHA256: 1AC70DDBFD59D0772AD3D244159D4620DD1D101F3C60D0F425CFAF9F9E402A07。
- 主要5資産は本体・別展開・ローカルHTTP200でLF正規化後の全文一致。
- ブリッジ384・オフライン183・Windowsローカル版1,369・パッケージ766項目が合格。データ203 JSON / DTC3,878件はエラー・警告0。
- 診断画面全体のブラウザー回帰が合格（readiness-review-fTStgr）。実取込・検索・初期化・移動・画面幅/明暗・記録維持を確認。外部/車両要求0。
- 全体OBD回帰7,447項目・エラー0で合格。実装コミット806e0dd50e104b95368c7d3bbb7e4e49eed81e3bの本番dpl_DmyT19t6yAeC6f3p9y45NrbFyUXaがREADY。tool.mukiguri.comへの割当と、主要5資産の公開HTTP200・LF正規化後の本体全文一致を確認。実車/VCI試験ではない。
