# R2 通常読取と取得記録の統合境界

確認日: 2026-10-09。本体3.13.636。基本読取内の同一設定世代に属する4項目の原文を集約する。実車由来、応答形式の認定、診断評価、消去実行の許可を示すものではない。

## 3.13.636 基本読取内の4項目集約

`readObdDeveloperCoreScan` が03/07/0A/0101専用の所有者を作り、各読取関数へ明示的に渡す。DTCとレディネスの各操作は、その所有者が現在の基本読取と一致する場合だけ、一時原文を一度消費して集約へ渡す。途中のFF・ECU情報・Mode06・対応PID・ライブ値読取にも同じ所有者を渡すが、それらの原文は集約しない。既存の送信順序は維持する。

集約はメモリ内の `coreRawReadoutCapture` に分離し、最大4項目・各12000文字を順序と時刻、接続参照、設定ticket、revision、接続・解除状態で照合する。基本読取が最後まで戻り、4項目が揃った場合だけtake可能になる。4項目の原文が揃っても、基本読取の全項目成功や故障なしを意味しない。profileはnull、実車由来と実行許可はfalseのまま。既存session・保存JSON・ログへ集約を転記しない。

別の手動読取、所有者のコピー、取消、設定世代変更、新しい基本読取、再初期化、reset、pagehide、切断では旧集約を破棄する。途中例外や4項目未取得も破棄し、部分集約を完成扱いしない。takeは一度だけであり、返却済み配列の寿命は今後の利用側の責任。

既存の設定再照会によるticket失効は緩めない。そのため、すでにプロトコル観測済みの接続で基本読取を繰り返すと、診断読取は続いても原文集約は利用不可になる場合がある。模擬試験では、明示的な再初期化後に新しい世代の4項目を取得でき、古い集約は復活しないことを確認した。自動再初期化・自動再送は追加していない。

`validate-serial-integration.js` は通常の基本読取での4項目順序・一度限りの取得・実行権限なしに加え、設定変更・別読取の割込み・所有者コピー・取消・再照会と明示復帰を検証する。次工程は、集約の取得状況と利用不可理由を原文非公開の状態表示へ接続すること。profile未確認のまま既存の限定parserへ固定形式を指定して渡さない。

## 3.13.635 通常読取操作への接続

`runObdDeveloperRead` の03/07/0A/0101だけを `readElmDeveloperCommandRecord` へ接続した。既存の応答文字列をそのまま診断処理へ渡し、原文は専用の `rawReadoutCapture` に分離する。他のコマンドは既存senderを使用する。画面表示・診断結果・保存形式・送信順序は維持する。

`createWebSerialReadoutCapture` は一つの読取操作に属する対象コマンドだけを順序どおりに受け付ける。最大4記録・各12000文字で、未取得、順序不一致、時計の不整合、記録条件の失効では全体を破棄する。inspectは状態と件数のみで原文を返さず、takeは完了後に一度だけ不変の記録配列を返して内部保持を消去する。診断の成功と原文の取得完了は別であり、NO DATAを故障なしへ変換しない。

次の読取開始、設定照会、再初期化、接続情報reset、pagehide、切断で旧所有者を失効させる。アクセス時も接続参照・settingsTicket・revision・接続状態・解除状態を照合する。取得途中の失敗では部分原文を残さない。返却済み配列を遡って消去する機能ではなく、今後の利用側にも寿命管理が必要。

本体関数を使う `validate-serial-integration.js` に、03、07/0A、0101の通常読取、一度限りの取得、JSON出力への非混入、6種類の失効、途中失敗の原文破棄を追加した。従来の試験環境で省略されていたsettingsObservationも本体定義から初期化する。

この版では4項目集約は未実装だった。3.13.636では基本読取の明示的な所有者を追加したが、独立した手動読取の原文を後から寄せ集めることはしない。現在の条件と残作業は冒頭を参照。

## 今回の判断

通常読取の戻り値を開発用receiptへ渡すだけでは統合できない。表示用文字列は元の改行・終端を失っており、設定世代が有効でも解析profileは未確認のまま。次の最小単位は、既存の送信順序と戻り値を変えずに、**一つのコマンドの受信文字列を整形前に保持し、同じ取得区間に結び付ける内部処理**とする。

一コマンドの取得は下記の内部関数へ接続した。開発sessionの通常画面への接続は別工程とする。元の文字列を取得できても、応答形式・同一車両・消去前後の境界・実行許可の確認とは別である。

## 3.13.634 本体の取得フック

`script.js` に `createSerialCommandCapture` の実装を移し、fixtureは本体関数を読み出す試験用loaderに変更した。新しい内部関数 `readElmDeveloperCommandRecord(command, timeoutMs)` は既存senderを呼び、`{ response, record }` を返す。recordは利用不可ならnull。従来の `sendElmDeveloperCommand` の呼出しは表示用文字列を返すままで、原文を収集しない。

原文取得を要求した場合のみ、senderが実際の `pendingCommandOperation` へ所有者を関連付け、既存受信ループがデコード直後にappendする。正常終了でfinishし、wrapperがtakeした後は内部保持を消去する。timeout・書込失敗・取消でもfinallyで破棄する。設定の確認不能や記録側の失効では通常応答を維持してrecordをnullにする。例外をログや原文へ転記しない。戻り値を受け取った後の利用者側の保管・失効管理はこのwrapperの範囲外。

`validate-serial-capture-runtime.js` はdecoderを差し替えず、本体のフック自体を模擬wireで検証する。1/7/32768 byte分割、正常/timeout/設定不明/設定変更/書込失敗/取消/従来APIと、4コマンドの連続取得・04拒否・対象外コマンドの原文非保持の計22経路。通常文字列、送信順序、既存sessionを維持し、終了後に内部所有者から原文を再取得できないことを確認した。

この版では通常画面はまだ新関数を呼ばなかった。3.13.635の接続範囲と残作業は冒頭を参照。profileはnull、実車由来と実行許可はfalseを維持し、診断結果や保存形式へ未確認の原文を混ぜない。

## コードごとの接続条件

### 2026-10-09 一コマンド内部部品の実装

[serial-command-capture.js](scripts/fixtures/serial-command-capture.js) を開発用部品として追加した。固有operationと7接続条件へ結び付け、整形前の文字列を最大12000文字までメモリ内で保持する。begin/append/finish/takeで時計と条件を検査し、不明・逆行・失効・上限超過では原文を破棄する。finishは呼出側の完了通知でありpromptや応答形式の認定ではない。takeは終了済み記録を1回だけ返し、内部保持を消去する。返却済みの文字列を後から失効させる機能ではないため、利用側の受け渡し後の条件確認は別途必要。

`node deploy/scripts/validate-serial-command-capture.js` で寿命・時計・上限等に加え、実send/read関数の `pendingCommandOperation` を記録キーとして使用する模擬結合を確認した。1/7/32768 byteの分割、応答timeout、記録側のみの失効で通常の戻り値・送信順序・既存sessionが維持される。記録側の失効は物理通信の取消ではない。

この初期部品の段階ではフック未設置だった。その後の本体接続と残作業は上の「3.13.634 本体の取得フック」を参照。profile認定、4項目集約、永続保存、消去操作へは接続していない。

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

この検証は `validate-serial-lifecycle.js` からも実行する。既存の `validate-receipt-runtime-handoff.js` と `validate-development-session-serial.js` は、接続失効・設定世代変更・取消等の模擬結合を担当する。これらは試験側のdecoderフックであり、本体フックの検証は追加した `validate-serial-capture-runtime.js` が担当する。

## 次の内部記録実装の受入条件

1. 一コマンドにつき固有operationへ記録を固定し、単調時計で開始・終了を記録する。時計異常・上限超過・所有者失効は記録を利用不可にする。
2. 受信ループのデコード直後の文字列を保持する。改行変換、prompt追加、途中切捨てによる補修をしない。内部記録は有限長・メモリ内とし、ログや永続保存へ自動転記しない。
3. 切断・再接続・取消・設定世代変更・遅着chunkで、旧取得の完了や利用を復活させない。writeが未完了の間は記録終了を通信終了として扱わない。
4. 通常読取のコマンド順序、表示用戻り値、例外、診断結果、保存形式を維持する。記録側のcallbackから送信・再試行・設定変更を開始させない。
5. 模擬wireで通常経路と内部記録を同時に確認する。最初はparserの設定確認や4項目集約へ接続せず、利用不能な記録を診断の正常結果に補完しない。

上記の内部部品・本体フック・通常画面の読取操作・同一基本読取内の4項目集約を実装した。状態表示と解析への接続は未完了。実機設定の根拠、車両との関連付け、永続監査、消去実行については [R2設計](R2-DTC-CLEAR-DESIGN.md) と [通信根拠](R2-ELM327-PROTOCOL-EVIDENCE.md) の別工程を維持する。
