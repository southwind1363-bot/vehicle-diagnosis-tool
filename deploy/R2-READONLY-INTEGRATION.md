# R2 通常読取と取得記録の統合境界

確認日: 2026-10-09。本体3.13.633のコード照合とメモリ内の模擬wireによる確認。通常経路への組込み完了、実車由来、消去実行の許可を示すものではない。

## 今回の判断

通常読取の戻り値を開発用receiptへ渡すだけでは統合できない。表示用文字列は元の改行・終端を失っており、設定世代が有効でも解析profileは未確認のまま。次の最小単位は、既存の送信順序と戻り値を変えずに、**一つのコマンドの受信文字列を整形前に保持し、同じ取得区間に結び付ける内部処理**とする。

この内部処理を実装するまでは、開発sessionを通常経路から呼び出さない。元の文字列を取得できても、応答形式・同一車両・消去前後の境界・実行許可の確認とは別である。

## コードごとの接続条件

| 境界 | 現在の通常経路 | 開発用処理との差分・次に必要なこと |
| --- | --- | --- |
| 受信内容 | [script.js](script.js) の `readElmDeveloperLoop` はデコード文字列を `textBuffer` へ追加。`takeCompletedElmDeveloperResponse` は終端を除去し、CR/CRLFをLFへ変換してtrimする | [readonly-receipt-capture.js](scripts/fixtures/readonly-receipt-capture.js) は改行・promptをそのまま保持する。表示文字列や加工済みログからの復元は禁止。別の受信ループを開始せず、既存ループの整形前の入力を取得する必要がある |
| 取得区間 | `sendElmDeveloperCommand` は `pendingCommandOperation` とポート・reader・writer・revisionを確認し、開始時にバッファを空にする | 内部記録を同じoperationへ固定する。開始前のバッファ、終了後・別operationのchunkは取り込まない。バッファ消去だけでは機器側の遅着応答が新しい要求由来と証明されたことにはならない |
| 設定 | `initializeElmDeveloperAdapter` はATZ/ATE0/ATL0/ATS0/ATH1/ATSP0を実行。`createReadOnlySettingsObservation` は `profile:null` / `profileVerified:false` | [readonly-receipt-session.js](scripts/fixtures/readonly-receipt-session.js) は呼出側指定profileとsettingsTicketの寿命を照合する。ticketの存在を設定確認済みへ昇格しない。現在の初期化に対してS1を固定指定してはならない |
| 読取順序 | `readObdDeveloperDtc` は03の後にATDP/ATDPNを照会し、07/0Aへ進む。基本読取はFF等を挟んでレディネスを読む | [readonly-receipt-run.js](scripts/fixtures/readonly-receipt-run.js) の固定03/07/0A/0101を通常の基本読取の代わりに呼ばない。まず一コマンドの記録を取得し、4項目への集約とその途中の設定世代変更は別工程で扱う |
| 完了・取消 | 送信処理は待機中write、応答timeout、切断を管理する。表示用の戻り値と例外を既存呼出側が扱う | [readonly-development-session.js](scripts/fixtures/readonly-development-session.js) のcancelは物理writeを撤回しない。記録取得の失敗と通常読取の失敗を混同せず、内部記録の失効で既存の診断結果を上書きしない |
| 設定準備 | 現行許可一覧にATCAF1/ATD0/ATCEA/04はない | [readonly-settings-preparation-run.js](scripts/fixtures/readonly-settings-preparation-run.js) の模擬callbackを通常senderへ直結しない。内部記録の追加のために許可一覧を増やさない |
| 保存・候補選択 | 保存済み記録からのcontrollerは `target:null` / `evidence:{}` の候補状態 | raw記録を既存保存形式に追加する変更は今回の範囲外。表示結果から同一車両や消去前後を推定して実行条件を埋めない |

## 整形後に復元できないことの再現

`node deploy/scripts/validate-readonly-integration-boundary.js` は実際のsend/read関数を既存の人工wireへ接続し、同じ4項目についてCR終端とLF終端を入力する。

- 通常の戻り値は両方で同じ文字列になる。
- 整形前の文字列を保持すると、既存の限定parserはCR例をparsed、LF例をrejectedとする。これは本実装の受入範囲の確認であり、規格全体の妥当性判定ではない。
- 戻り値にCRとpromptを補うと、LF例からもCR例と同じ文字列を作れてしまう。これを取得した原文として扱ってはならない。
- 有効な初期化ticketがあってもprofileはnullのまま。既存の診断session、送信一覧、禁止コマンドは維持される。

この検証は `validate-serial-lifecycle.js` からも実行する。既存の `validate-receipt-runtime-handoff.js` と `validate-development-session-serial.js` は、接続失効・設定世代変更・取消等の模擬結合を担当する。いずれも試験側のdecoderフックであり、通常版にraw記録の取得を実装した証拠ではない。

## 次の内部記録実装の受入条件

1. 一コマンドにつき固有operationへ記録を固定し、単調時計で開始・終了を記録する。時計異常・上限超過・所有者失効は記録を利用不可にする。
2. 受信ループのデコード直後の文字列を保持する。改行変換、prompt追加、途中切捨てによる補修をしない。内部記録は有限長・メモリ内とし、ログや永続保存へ自動転記しない。
3. 切断・再接続・取消・設定世代変更・遅着chunkで、旧取得の完了や利用を復活させない。writeが未完了の間は記録終了を通信終了として扱わない。
4. 通常読取のコマンド順序、表示用戻り値、例外、診断結果、保存形式を維持する。記録側のcallbackから送信・再試行・設定変更を開始させない。
5. 模擬wireで通常経路と内部記録を同時に確認する。最初はparserの設定確認や4項目集約へ接続せず、利用不能な記録を診断の正常結果に補完しない。

上記は次工程の受入条件であり、今回実装済みとはしない。実機設定の根拠、車両との関連付け、永続監査、消去実行については [R2設計](R2-DTC-CLEAR-DESIGN.md) と [通信根拠](R2-ELM327-PROTOCOL-EVIDENCE.md) の別工程を維持する。
