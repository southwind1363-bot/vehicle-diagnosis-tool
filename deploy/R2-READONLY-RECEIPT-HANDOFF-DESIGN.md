# R2 通常read-only取得からの記録受渡し契約

## 2026-10-06: 設定未観測を解消する次工程

[通信設定を成立させる実装設計](R2-READONLY-SETTINGS-ENABLEMENT.md)へ、一次資料・固定候補列・既定無効の準備処理・失敗停止・復旧条件を整理した。DLC既定値はPP29に依存し、ATZの応答からD0を推定できない。候補ATCAF1/ATD0/ATCEAは照会ではなく設定変更なので、通常初期化へ暗黙に追加しない。まず非実行の準備器を実装し、本体capture接続と実機確認は別工程にする。本体3.13.628は維持。

## 2026-10-06: 同一接続での設定変更による取得失効

port/reader/writerとserial revisionだけでは、同一接続上の再初期化を検出できない。非通信receipt sessionのcontextへsettingsTicketを必須追加し、参照変更・欠落・不正型で旧captureを失効する。これは呼出側の設定所有者が発行する世代参照であり、設定内容やprofileの真正性を証明しない。

実関数結合試験は本体初期化を模擬byteで通してから取得を開始し、settings ownerのinspectが有効な場合だけそのticketをproviderへ渡す。参照が残ったままownerのみ失効したケースもnullとして拒否する。収集中/完了後の再初期化・pagehide・接続情報reset・owner失効・protocol再照会を、port/reader/writer/revisionが変わっていないことと併せて確認。新初期化後は新しいモデル取得を開始できるが、設定観測のprofileはnullのまま。

モデル243項目と結合209項目で検証。S0/S1は人工入力への宣言profileであり、初期化応答から確定したものではない。設定失効の本体captureへの同期配線は未実装で、productionへの接続許可を追加しない。本体3.13.628・通常表示・保存形式・配布ZIPは変更なし。

## 2026-10-06: 接続寿命付き取得記録と実送受信関数の結合試験

設定hook試験の模擬writer/reader・隔離VMをserial-runtime-harnessへ抽出し、同じ本体関数を二つの試験で使用する。新しい試験はdecoderの戻り文字列を試験側でだけreceipt sessionへ渡し、同一port/reader/writerのまま03/07/0A/0101を送受信する。本体にcapture hookを設置したものではなく、profile・時刻は明示的な試験値。

142項目でS0/S1・1/7/全体byte分割のraw評価、既存の表示正規化との分離、旧commandの遅着拒否、完了後の実disconnect関数による失効を確認。NO DATAは文法成立と意味判定を分け、S1宣言へS0/bare LFを渡すと文法拒否となる。timeout・12000文字超過・decode中の切断/reader交換/writer交換/revision変更/lockでは完全receiptを返さず、試験側の失効処理により遅いpromptも拒否する。追加送信・自動再送はない。

既存設定hook80項目も維持。物理portのopen、driver実行、実車通信は行わない。実transportの設定確認と時刻/完了イベントの所有、productionの同期失効hookは別工程。本体3.13.628・配布ZIP・保存形式は変更なし。

## 2026-10-06: 取得記録を接続寿命へ結合する非通信モデル

readonly-receipt-sessionは既存captureの外側で接続contextを保持する。begin/startCommand/append/endCommand/finish/inspectの各入口でport/reader/writer参照・revision・connected/unlockedをown data descriptorから確認し、違い・例外・不正contextではcaptureを失効してraw参照と結果を解放する。接続値を戻しても旧ticketは復活しない。呼出元は切断等のイベントでinvalidateを同期実行する必要があり、このモデル自体はイベント購読しない。

試行とcommandのticketは外側でも私有参照にし、内部captureのticketを公開しない。旧/複製/欠落commandはproviderを呼ぶ前に拒否する。providerやparserから再入して新しい取得が始まった場合、古い処理結果を返さず新試行を維持する。完了した結果の参照もcontextを再確認するが、呼出側に渡し済みのsnapshotを物理的に撤回するものではない。

218項目でS0/S1の既存評価、全操作のcontext変更、完了後切断、遅着、getter非実行、例外・再入を検証。profileは引数で明示必須であり、実測設定や実車同一性を証明しない。実機設定が未確認の現行productionへは接続しない。通常画面・保存形式・本体3.13.628・配布ZIPは変更なし。

## 2026-10-06: protocol確認の分類失敗で観測を失効

ATDPにERRORが返っても、その後のATDPNがA6なら観測が残る不整合を模擬byte試験で再現した。captureObdDeveloperProtocolAfterStoredDtcは、既存分類がcompletedの時だけ番号を記録し、それ以外では開始時ticketが現在のticketと一致する場合に限り失効する。失効後のATDPNは旧ticketとして拒否される。既存のcommand順序・identity集約・戻り値は変更しない。

ERROR・?・UNABLE TO CONNECTの3ケースと、再初期化後に古いATDP失敗が到着するケースを追加し、合計80項目で確認。本体3.13.628。これはメモリ内送受信の検証で、CAF/DLC/アドレス方式は引き続き未観測、profile=null・送信許可なしを維持する。

## 2026-10-06: 設定観測と送受信関数の結合検証

既存runtime hook試験へメモリ内のwriter/readerを追加し、本体のsendElmDeveloperCommand・read loop・完了待機・正規化・設定観測を通して検証する。1/7/全体byte分割、ATE0のechoとCRLF、既存8commandの送信byte一致、完了後の処理所有権解放を確認。二重OK・ERROR・prompt欠落・12000文字超過・複数protocol・空応答・置換文字では設定summaryを使用できず、自動再送もしない。pagehide失効も確認した。

追加39項目、従来分を含む68項目。poll待機の時計とbyte供給は人工値であり、物理portのopen・実機通信・driver実行はしない。profileはnullのまま。本体・公開資産・保存形式は3.13.627から変更なし。

## 2026-10-06: 本体の既存受信経路へ設定観測を接続

二つの観測factoryをscript.jsへ移し、開発用moduleは本体の純粋関数を隔離VMで読み込む試験adapterへ変更した。通常obdDevSession内の非保存領域にowner/ticketを持ち、初期化開始で新ticket、既存commandの正規化済み応答を記録する。provenanceはunverified_inputで、実車検証済みとは扱わない。送信command・timeout・分類・ログ処理は従来のまま。

既存ATDPN応答を現在のticketへ記録。二回目のprotocol確認では以前の観測を送信前に失効し、設定証拠の再利用には再初期化を必要とする。失敗/接続情報reset/切断開始/pagehideでも失効し、transport cleanupを待たない。遅い初期化/ATDPN応答は新ticketへ書き込めない。

本体の実context providerと初期化/protocol/切断/reset/pagehide関数を模擬応答で動かす29項目を追加。停止しないcancel、revision不変の通信断、失敗、再照会、遅着を検証。既存314/233項目も同一本体factoryを使う。通常画面への表示・receipt captureへの許可連携・実機試験はまだ行っていない。CAF/DLC/アドレス方式が不明のためprofileはnullのままで、これだけではraw記録の設定を確定しない。

## 2026-10-06: 設定観測の接続寿命モデル

`readonly-settings-session.js`は設定観測所有者を私有session ticketに結び付ける。生成時に指定する信頼済みcontext providerはport/reader/writerの参照、非負整数revision、connected/unlockedの真偽を返す。beginと記録/inspectの際にown data descriptorだけを読む。contextのwrapper objectが同じである必要はないが、内部の接続参照と値は開始時と一致しなければならない。

不一致やprovider失敗で記録を失効し、値を元に戻しても復活させない。旧ticketはproviderを呼ばず拒否。providerやProxy descriptor内で再初期化/失効されても、古い処理は新しい試行を変更せず終了する。明示invalidateはrevision変更や切断完了のawaitを必要としない。233項目で初期化中/観測後の各参照変更・ロック・通信断・遅着・再入を検証。

これは非通信モデルで、providerの真正性や実車適合を証明しない。現在のアプリへevent hookは追加していないため、実際のdisconnect/lock/pagehide等では今後同期invalidateを呼ぶ必要がある。保存済みsummary自体は撤回できないので、利用時はsession.inspectで再検査する。profile=nullと全実行flag=falseを維持し、表示summaryを解析許可には使わない。

## 2026-10-06: 初期化・protocol応答の開発用記録

`readonly-settings-observation.js`は現行のATZ/ATE0/ATL0/ATS0/ATH1/ATSP0と、その後の単一ATDPN応答を記録する非通信モデル。私有ticketの参照で試行を区別し、begin/失効では旧観測を使用不能にする。正規化済み応答を受け、初回ATE0のecho移行だけは`ATE0\nOK`を許す。ほかは厳密な`OK`のみで、部分一致・複数OK・ERROR混在は拒否する。順序違反/不正応答後は観測を破棄する。

ATZは非空の応答を受け取ったことしか扱わず、bannerからreset成功・既定値・adapter真正性を推定しない。ATSP0へのOKとATDPNの11bit対応番号の報告は別観測。6/8/A6/A8でもCAF/D/アドレス方式は不明なためprofile=null・profileVerified=falseを維持する。summaryにはcommand名と限定protocol値、不明項目だけを残し、raw応答は保持しない。

314項目で拒否・失効・不明設定を検証。さらに実際のinitializeElmDeveloperAdapterと分類関数を隔離VMで使い、模擬送信先への6commandと各失敗時停止を照合した。実機やportは使わず、productionの設定記録hook・decode/完了境界・接続寿命は未接続。明示的な失効の配線と、残る設定をどう観測するかは次工程。通常UI/保存schema/送信許可を変更しない。

## 2026-10-06: S0の一取得評価・所有者・見本への接続

一取得APIは四つのreceiptすべてが同じ許可profile（S0またはS1）であることを確認し、既存のDTC/readiness観測へ渡す。profileは必須で、混在・未知値を拒否する。消去前後APIは従来どおりS1に限定し、今回の拡張を消去処理へ適用しない。

開発用所有者/captureは第二引数でprofileを明示選択し、生成後は固定する。省略時はS1、異なるprofileのreceipt/commandは拒否。raw/時刻/設定を補正せず、profileEvidenceはcaller_declared_only、実車・実行・送信flagはfalseを維持。これは保存schemaの変更ではない。

17ケースでS0/S1の意味観測一致とowner/capture経由の同一結果を確認し、全4位置の混在・未知設定と旧消去APIの拒否も試験する。一取得の操作HTMLに固定S0正常例を追加し、条件変更で旧表示を破棄する既存経路を使う。実transportの設定観測と通常UIへの配線は未実施。

## 2026-10-06: read-only rawパーサーのS0対応

`parseElmReadOnlyRawTranscript`に明示profile `iso15765_11bit_normal_h1_caf1_d0_s0_e0`を追加。S0時のCAN行は大文字hex 19桁（3桁ID＋8byte）だけを受理し、桁数/文字種を確認してから既存ISO-TP検査へ渡す。CR/CRLF、終端prompt、状態行、資源上限、sourceごとの順序検査は共通。raw全体の空白除去やprofile自動推定は行わない。S1は引き続きcompact行を拒否する。

根拠: [Elm Electronics ELM327 v2.3 datasheet](https://www.elmelectronics.com/wp-content/uploads/2020/05/ELM327DSL.pdf) p.26のS0/S1説明（ECU応答への空白挿入制御）。実機がその設定を満たす証拠ではなく、11bit/H1/CAF1/D0/E0/通常アドレスもcaller宣言のまま。42ケースのNode/Chromium一致、S1とのpayload一致、29bit/混在/欠落/ISO-TP順序違反/上限を検証する。

これは文法パーサーだけの拡張。Mode04、生receiptの一取得/前後意味評価、capture所有者のprofile許可はS1のまま。実接続・設定観測・通常画面への配線は未実施で、既存のpayloadSemanticsVerified/実行/送信flagはfalseを維持する。

## 2026-10-06: 実受信関数を使う模擬byte結合試験

`validate-serial-receipt-handoff.js`はscript.jsから実際のread loop・完了待機・表示加工関数を読み込み、有限の模擬byte列とTextDecoderを使う。テスト側だけにdecode結果の観測処理を置き、captureへ渡す。navigator/実ポート/送信は使用せず、productionのhookや取得所有権を追加したことにはならない。profileと時刻は宣言された試験値、キャンセル監視はstubであり、実接続寿命の証明には使わない。

208項目で1/7/全体byte分割、CRLF・promptの無加工保持と既存表示結果の一致を確認。加工済み表示にpromptを足してもraw検査を通らず、S0応答・bare LFも固定S1/CR profileでは拒否される。終端欠落・空応答・容量超過ではテスト所有者を失効させ、遅着を拒否する。通常serial検証に登録した。

実read loopの上限は12000文字で、超過時にbufferを消去しserial_response_too_largeとして切断する。captureの32768文字上限まで受信できるわけではない。今後の配線は、この早い失敗境界より後でrawを復元せず、切断と同時に所有者を失効させる必要がある。固定S1設定を通常S0接続へ転記せず、設定観測の契約を先に解決する。

## 2026-10-06: 一取得の操作見本への接続

`single-readout-preview-session.js`は固定応答を7文字ずつcaptureへ追加し、commandの明示終了後に4記録を検証する。既存のinspect/disposeだけを外へ公開し、閉鎖・条件変更ではcaptureを失効させる。独立HTMLの固定module一覧にもcaptureを追加した。chunk分割と時刻は人工値であり、400msの待機も実受信の再現ではない。

Node/Chromium共通の199操作で1文字/7文字/全体入力のsummary一致、旧command遅着、旧試行・複製参照の拒否、上限超過後のsummary非公開と破棄を確認。正常/NO DATA/矛盾/終端欠落の既存表示と操作HTMLの閉鎖・遅着試験も合格。実transportへの接続には引き続きdecode・設定観測・完了イベントの契約が必要。

## 2026-10-06: 分割文字列の取得境界モデル

`scripts/fixtures/readonly-receipt-capture.js`はdecode済みの非空文字列chunkを、コマンド固有ticketにだけ追加する。begin/startCommand/append/endCommand/finish/inspect/invalidateを持つ開発用モデルで、portやdecoder、時計を呼ばない。profile/時刻はcaller宣言のまま。promptを見つけても自動終了・送信せず、明示終了時に生文字列を既存所有者へ渡す。

上限は1 commandのJS文字列length 32768。超過/入力不正ではbufferと所有receiptを破棄し、切捨て・正規化・prompt追加を行わない。旧command ticketは次commandへのappend/endに使えず、旧試行の失効は新試行を壊さない。処理中の世代変更も再検査する。これはJS文字列参照の解放であり、物理的メモリ消去の保証ではない。

全分割点、CRLF/prompt境界、1文字chunk、文字列の完全一致、上限ちょうど/1文字超過、二重終了、timeout/切断、偽造参照、終了時再入を1235項目で確認し既存receipt CIへ登録。byte列のdecode、実受信完了イベントの観測、ELM設定の実確認は別工程。既存sendElmDeveloperCommand/readElmDeveloperResponseへの配線はまだ行わない。

次工程の詳細: [一取得内のDTC/readiness意味観測契約](R2-SINGLE-READOUT-SEMANTICS-DESIGN.md)。既存observerを共通化し、仮の日時や接続参照を加えずrawから観測する設計を整理した。実装は未着手。

## 2026-10-06: raw文法検査の接続

管理元に信頼済み開発用runtimeを指定した場合、finish直前の所有receiptだけを既存parseElmReadOnlyRawTranscriptへ渡す。任意の表示summaryからrawを復元せず、prompt/改行/時刻を補正しない。API省略時は従来の構造検査のみ。関数descriptorを生成時に保持するが、これはruntimeの真正性の証明ではない。

rawTranscriptValidationにはparsed/rejected、command別のcompletion・prompt有無・frame数・エラーcode・NO DATA観測だけを凍結して残す。raw、payload、source IDを返さない。receiptStructureCompleteとfinishのokは構造成立だけを示し、文法がrejectedでも構造成立とは両立する。parsedでもpayloadSemanticsVerifiedや実車・比較・実行flagはfalse。正常なprefixだけではDTC/readinessの意味を検証したことにならない。

処理中はvalidatingとし二重終了を拒否。検査例外は固定理由で拒否し、処理中の新世代・失効は検査結果を破棄する。終了後にraw参照を解放する既存動作を維持。81項目で正常、NO DATA、prompt欠落、bare LF、NO DATA混在、未完了frame、例外、再入を確認し、既存107項目と境界試験も合格。

次は一取得内のDTC/readiness意味検証の契約。実消去境界や固定日時を追加して既存の前後比較へ見せかけない。通常UI/transport/保存への接続は未実施。


## 2026-10-06: 非通信モデルの実装範囲

`scripts/fixtures/readonly-receipt-owner.js`を追加。管理元ごとの私有WeakMapと現在ticketの参照一致で一試行を認識する。beginは旧試行を失効し、appendは4 commandの順序、宣言profile、非負の整数時刻順序、complete、transcript長1～32768を確認する。時刻は試験入力の数値であり実取得時刻の証明ではない。profileもcaller_declared_onlyで、通信設定を観測したとは主張しない。

finishは四つの構造がそろった場合だけreceiptStructureCompleteを返す。NO DATAや任意文字列も意味解析せず、payloadSemanticsVerified・網羅性・実車・比較・消去・実行関連flagはすべてfalse。返却summaryにrawやticketを含めない。finished/rejected/失効で内部配列のraw参照を解放するが、caller側の文字列やJSメモリの物理消去を保証するものではない。

同じ形/JSON複製/別所有者/旧世代、遅着、二重終了、欠落/重複/順序/時刻/profile/上限、例外、accessor非実行、反射操作中の世代変更を107項目で確認。既存receipt検証とCIから実行する。受信入力を扱うAPIは開発用モデルだけであり、実取得元の認証境界ではない。

次はこのモデルと固定のraw意味検証の受渡しを設計・検証する。現在のsummaryを検証済みpayloadや表示readyとして使用しない。通常UI、transport、DOM通知、保存への配線は未実装。


2026-10-06。ソース確認に基づく設計。通常UIへの接続、取得器の変更、保存形式の変更、実車試験は未実施。

## 今回の判断

固定模擬ページの成功を、そのまま通常診断の前後比較へ接続しない。次の実装単位は、通信を行わない取得記録所有者の試験モデルとする。既存Web Serialの読取・診断表示・保存は維持し、取得時の証拠と加工済み表示値を分ける。

二回のread-only取得は消去境界の証拠にならない。まず一回の取得記録の寿命だけを扱い、模擬clear受信や固定日時を実取得へ挿入しない。実消去前後比較、Mode04送信、成功判定はこの契約に含めない。

## 現行ソースと不足

参照箇所はすべて [script.js](script.js) の関数名で示す。

| 現行箇所 | ソースで確認した動作 | 受渡しに必要な変更・制限 |
| --- | --- | --- |
| `sendElmDeveloperCommand` / `readElmDeveloperResponse` | command開始時のport/reader/writer・revision・処理所有者を固定し、許可リストを通して送信。3.13.630でwrite待ち中のreader入替を拒否、3.13.631で旧writeのタイムアウトによる別世代/別所有者の切断も拒否 | この所有者の内側で取得情報を発行する。UIやJSONが指定するtokenを認証に使わない |
| `takeCompletedElmDeveloperResponse` | 末尾promptを除去、CRをLFへ変換、trimして返す | 返却文字列へpromptを付け直してraw証拠と呼ばない。加工前の境界を扱う設計・試験が必要 |
| `runObdDeveloperRead` | `{command,response,responseElapsedMs}`を蓄積。読取全体の開始日時と失敗/中断を扱う | command別の開始/終了、受信完了状態、試行所有者を失わず結び付ける。成功応答だけで欠落commandを補完しない |
| `buildWebSerialAttemptTranscript` | command見出しを付けた文字列へ再構成する | 再構成文は表示・既存解析用。取得証拠に昇格させない |
| `appendObdDeveloperLog` | redact後に連結し末尾20000文字へ制限 | ログから完全なreceiptや取得順序を復元しない |
| `retainObdDeveloperReadout` | 解析値・過去のsnapshotを組み合わせ通常sessionへ反映 | `lastSession`や保存済みsnapshotは単一試行のraw証拠ではない。既存表示を壊さず別所有者に保持する |
| adapter初期化 | `ATE0`,`ATL0`,`ATS0`,`ATH1`,`ATSP0`を使用 | 固定fixtureの`iso15765_11bit_normal_h1_caf1_d0_s1_e0`を転記しない。S0/S1の差、CAF/D設定、11bit/29bit・protocolの確認が必要 |
| `createObdDtcClearTargetBindingController` | port等の現行参照を検査するがECU scopeは`not_observed`、対象/実行は未成立 | source IDや車名が一致してもscope・実車同一性・消去対象の証明へ昇格させない |

この確認はWeb Serial経路に限定する。ローカルbridge、J2534、native、replay/importは別の取得元契約を必要とし、同じ文字列形式という理由だけで参加させない。

## 新しい所有者の最小契約（未実装）

所有者は一ページ・一接続世代・一取得試行に限定する。生成時の私有登録で発行した参照だけを認識し、同じ形のobject、JSON複製、別所有者・旧世代の参照は拒否する。外部から任意factoryやraw記録を渡せる通常UI APIは作らない。

取得器が持つ情報を、正規化前のcommand応答、順番、開始/終了、完了/timeout/中断/切断、設定の観測根拠、接続・対象・試行の私有参照に分ける。欠測した値は未観測として保持し、現在時刻や固定profileで埋めない。設定確認のための新しい送信もこの工程では行わない。

最初の非通信モデルでは固定4 intent（stored/pending/permanent DTC、readiness）の期待順序を開始時に固定する。既存の任意command読取を四つの完全receiptへ見せかけない。実取得器への配線は、そのモデルの受入条件と対応する設定profileが成立してから別変更で行う。

資源上限はモデルで明示し、超過時は試行を拒否・破棄する。切捨て後の末尾や途中までの記録を完全取得としない。既存fixtureの数値上限は [対応表](R2-BROWSER-EVIDENCE-PORT-MAP.md) を参照できるが、現在のtransport bufferに適用済みとは扱わない。

UIへ渡すのは検査後の派生値と保留理由だけ。raw/tokenはDOM・ログ・保存へ追加しない。取得の完了と、payloadの意味、対応ECU、同一車両、網羅性、消去境界は別判定とする。既存の実行/車両送信flagを有効化せず、模擬sessionに実記録を入れない。

## 失効イベントの配線候補

| イベント | 現行の確認箇所 | 新所有者で必要な動作 |
| --- | --- | --- |
| 新しい読取開始 | `runObdDeveloperRead`の開始時に既存target bindingを失効 | 待機前に旧所有記録を失効、旧本文を同期消去 |
| 手動切断・通信断 | `disconnectObdDeveloperVci`、`handleObdSerialDisconnect` | 切断完了を待たず表示handleを失効。通常の失敗記録は保持 |
| ロック | `lockObdDeveloperMode`とaccess lock経路 | handle失効と表示解除。切断成功とは別に扱う |
| 元sessionの置換 | `handleObdReadoutSessionReplacement` | 旧sessionに結び付くhandleを失効。共有診断記録は削除しない |
| pagehide | 既存journal comparisonの解除listener | 新所有者にも同期失効を配線。履歴復帰で自動再取得しない |
| 対象/接続設定変更・表示閉鎖 | 新所有者の実装時に全入口を列挙 | awaitや再描画より先に世代更新と失効。候補一覧だけで配線完了としない |

通信断時は既存の診断失敗を保持するためserial revisionを増やさない場合がある。新所有者の失効をrevision増加だけに依存させない。表示破棄からtransport切断完了を推定しない。

## 次の変更単位と受入条件

1. 非通信の私有所有者モデルを作る。transport、通常UI、保存先には接続しない。
2. 同一所有者・同一世代だけ受理し、複製・別所有者・失効後・二重終了・遅着を拒否する試験を作る。
3. command欠落/重複/順序違い、未観測profile、timeout/切断、上限超過を完全な取得へ補正しない。NO DATAは取得ゼロの証明にしない。
4. 各終了経路でrawの所有を解放し、検査失敗から自動再取得しない。通知や表示に失敗しても旧readyを残さない。
5. 以上の後に実取得器のraw境界・設定確認を別レビューし、実機接続と最終可否は利用者が判断する。

通常UIへの組込みを先行させず、既存の診断表示・保存schema・read-only許可リストを変更しない。関連確認元は `validate-serial-lifecycle.js`、`validate-dtc-clear-target-binding.js` と固定模擬ブラウザー試験。既存試験の成功を未実装の契約成立とは報告しない。
