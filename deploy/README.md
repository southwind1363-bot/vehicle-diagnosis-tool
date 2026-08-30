# 自動車整備 診断補助ツール

登録済みJSONデータ、問診、整備事例を使って、確認順序を整理する診断補助ツールです。

## 現在の完成版

3.13.361ではUDS応答試行証跡を`uds_read_transport_response_lifecycle_v1`へ接続し、未開始、応答受信、負応答、pending、timeout、transport error、cancelled、無効証跡を分離しました。保存データからは状態と安全属性を再構築し、改変された実行フラグを受け入れません。raw応答・rawフレームは保持せず、adapter未実装、dispatch無効、車両コマンド無効を維持しています。UDS/CAN FDソフト進捗を54%へ更新しました。

3.13.360ではUDS ReadDataByIdentifierのtransport計画を`uds_read_transport_adapter_boundary_v1`でローカルbridgeの`read_ecu_info`境界へ接続し、`uds_read_response_attempt_evidence_v1`で未試行、応答受信、負応答、pending、timeout、transport error、cancelledを分離しました。bridgeが公開する境界も実adapter未実装、dispatch無効、rawフレーム非保持、車両コマンド無効を固定しています。矛盾する応答証跡は無効として保存し、JSON再取込後も安全属性を再構築します。UDS/CAN FDソフト進捗を50%へ更新しました。

3.13.359では`uds_read_request_manifest_v1`へ`uds_read_transport_plan_v1`を接続しました。明示されたISO-TP、CAN/CAN FD、要求・応答ECU、応答待機時間を個別に正規化し、transport未指定、未対応network、ECU不足・不一致、待機時間未設定を個別理由で遮断します。全条件が揃っても実transportアダプター未実装として送信・実行は無効で、rawフレームやコマンド列は保持しません。JSON往復後も計画を安全フィールドだけで再構築し、UDS/CAN FDソフト進捗を46%へ更新しました。

3.13.358ではUDS ReadDataByIdentifierの次読取計画へ`uds_read_request_manifest_v1`を追加しました。明示されたDID候補、確認状態、対象ECU、明示待機時間だけを保持し、単一の確認済みDIDだけを選択します。未確認、無効、複数候補、ECU不一致は個別理由で遮断し、確認済みでも実transport未実装として実行不可です。コマンド列とraw要求は保持せず、JSON往復後も全送信・実行フラグをfalseに維持し、UDS/CAN FDソフト進捗を42%へ更新しました。

3.13.357ではraw UDS ReadDataByIdentifier応答へ要求DID一覧、応答先頭DID、payload長、境界判定を値と分離したuds_did_response_evidence_v1として追加しました。複数DID要求と要求DID不一致ではpayloadを先頭DIDの値と推測せずunparsedに留め、raw payloadやVINを証跡へ保存しません。従来の単一DID取込、ECU/プロトコル/NRC、JSON往復、送信無効を維持し、UDS/CAN FDソフト進捗を38%へ更新しました。

3.13.356ではJ2534匿名化証拠へ厳格な`j2534-native-preflight-evidence-validation-v1`検証を追加しました。完全キー、32KB入力上限、時刻、実行環境、登録数、選択、v2契約、blocker、署名、mutex、identity検査、安全falseフラグの意味整合を確認し、no-driver、verified、rejectedの矛盾や改変を拒否します。package検証276件で、整合性検査後のstdin検証まで確認済みです。ベンダーDLLのロード、実VCI、車両通信は行いません。進捗率は46%です。

3.13.345ではiPhone保存JSONの復号を既存Builder検証へ統一しました。通常の`JSONDecoder`でもread-only、安全フラグ、scan/connection/vehicle境界、sequence、マニフェスト、readout profile、adapter evidenceを再検証し、正式な`decodeValidated`取込では復号前に2MB上限も適用します。証拠5項目がない安全な旧JSONと中断記録は維持し、部分証拠、危険フラグ、壊れたJSONは拒否します。車両送信無効は維持し、macOS CI Run 802とDeploy CI Run 1207で成功しています。

3.13.342ではiPhoneでBLE接続後、書込み特性、通知特性、同一サービス内のGATT組合せ数を車両読取前に表示します。一意な1組だけを自動選択し、候補不足、複数候補、サービス分離は手動確認として残します。Swiftテスト、Simulator統合、OBD取込、未署名実機IPA生成はmacOS CIで成功していますが、広告やGATT構成だけではELM327適合や車両通信成功を確定しません。

3.13.341ではiPhoneのBLE探索候補へRSSI、接続可能広告、公開サービスUUIDを保存せず表示する処理を追加しました。広告情報がない機器を自動排除せず、名称やサービスUUIDだけでELM327適合と断定しません。macOSでSwiftテスト、Simulator統合、OBD取込、未署名実機IPA生成を再検証済みですが、Apple署名、iPhoneインストール、手持ちELM327との実通信は未完了です。

3.13.340ではiPhone用ELM327 BLEホストの開発署名経路を追加しました。署名処理は手動起動と保護Environment承認に限定し、開発証明書・登録端末を含むプロファイル・App ID・期限・生成IPAの署名を検査し、一時資格情報を終了時に削除します。現時点ではApple資格情報を設定していないため署名済みIPA、iPhoneインストール、実機通信の完了ではなく、接続と車両コマンドは無効のままです。

3.13.339ではiPhone用ELM327 BLEホストのmacOS/Xcode実走、Simulator統合、OBD取込、`iphoneos` Release未署名IPA生成と完全未署名検証の成功を公開状態へ反映しました。これはApple署名、iPhoneへのインストール、手持ちELM327のBLE GATT適合、実車読取の完了を意味せず、接続と車両コマンドは無効のままです。

3.13.336以降のPC配布版は `inspect-workstation-j2534.cmd` を開くと、登録ドライバー、DLLの32/64bit、静的検査結果と次の確認を日本語で表示します。番号を選ぶと、対象DLLをロードしない専用workerで固定ドライブ、同一ファイル、SHA-256、サイズ、PE構成を再確認します。VCI・車両の接続は不要です。配布版は内容検査に成功してから確認を開始します。DLL実行、`PassThruOpen`、車両通信、診断データ保存、外部送信はありません。worker終了未確認時だけ再試行防止の隔離状態を端末内に保存し、自動解除しません。検査合格でも実車適合・接続成功ではなく、実機通信機能の実装と試験は残っています。自動実行では `inspect-workstation-j2534.cmd --preflight-index 番号 --no-pause` を使えます。匿名化証拠だけを取得する場合は `inspect-workstation-j2534.cmd --evidence-json --no-pause`、選択した登録ドライバーの非実行preflight証拠は `inspect-workstation-j2534.cmd --preflight-index 番号 --evidence-json --no-pause` を使います。取得済みJSONは `type 証拠.json | inspect-workstation-j2534.cmd --validate-evidence-stdin --no-pause` で厳格検証できます。`npm run inspect:j2534` は既存項目を維持し、identity probe readinessを追加表示します。

J2534の初回DLL実行は通常の非実行preflightと分離します。`j2534-identity-probe-readiness-v1` はlive registry descriptor、同一操作内preflight、配布整合性、Authenticode、quarantine、全体mutex、対話確認を個別に保持しますが、現在は未実装workerゲートを必ず残し、DLLロード、`PassThruOpen`、車両通信を許可しません。公開オブジェクトや検査結果は実行許可証として再利用できません。

3.13.338ではlive registryから発行した中身のない操作handleを15秒・一回限りで消費し、同一操作内の非実行preflightだけをreadinessへ反映するorchestratorを追加しました。clone、再利用、期限切れ、並行実行、登録変更、終了未確認後の再実行を拒否します。preflight成功後も署名、quarantine、全体mutex、対話確認、identity workerは未確認のため、identity実行許可にはなりません。

J2534の次工程として、接続・識別情報取得・終了の内部処理と模擬応答による異常系検証を追加しました。実DLLローダーや公開ブリッジには未接続で、実機通信の開放ではありません。検証は `npm run validate:j2534-lifecycle`、設計と残作業は [J2534内部接続処理](scripts/J2534-IDENTITY-LIFECYCLE.md) を参照してください。進捗率は実機確認前のため変更していません。

内部処理を固定の模擬ワーカーで実行する監視処理も追加しました。中止・タイムアウト・出力超過では終了要求後も子プロセスの終了確認まで二重起動を防ぎ、異常終了した出力を成功結果として採用しません。検証は `npm run validate:j2534-supervisor`。これは模擬環境の検証で、実機DLLを動かすワーカーとの接続はまだありません。

Windows DLL呼出し部のソースを追加しました。`PassThruOpen / PassThruReadVersion / PassThruClose` の3関数と80バイトの情報受渡しを実装し、32bit・64bitの個別テストを `npm run validate:j2534-native` で行います。固定テンプレートから生成してテスト後に削除するネイティブDLLにより、Windowsローダー、完全一致エクスポート、x86 StdCallとx64 ABI、バッファ破損時の停止を実際に検証します。実VCIドライバーは実行せず、実ドライバー用ワーカーへの適用と実機試験は残っています。公開版・PC配布版には同梱していません。[検証範囲と残作業](scripts/native/README.md)

生成ネイティブDLL専用のx86/x64ワーカー監視も追加しました。正常、Open失敗、破損、ハング、クラッシュ、結果出力後ハングを別プロセスで確認し、異常終了時の結果やcleanupを成功扱いしません。実行要求にはEXE/DLLパスを出さず、検証用ファイルの場所・ID・サイズ・SHA-256を毎回確認します。これは開発用fixtureの隔離確認であり、実ベンダーDLL・実VCI・車両通信の開放ではありません。

登録J2534 DLLを実行せずに検査するWindowsネイティブpreflightも追加しました。同一ファイルhandleから固定ドライブ、最終パス、reparse、volume/file ID、サイズ、SHA-256、PE machineを照合し、x86/x64 fixtureで拒否条件を確認します。PC配布作成時にx86/x64 helperを生成し、配布完全性一覧と専用SHA-256 manifestへ固定します。登録DLLの秘密パスはone-shot workerのstdinだけへ渡し、公開結果、argv、stderrへ出しません。結果はロード許可として再利用せず、実ベンダーDLLのロード、export解決、Open、車両接続は行いません。

現在 `localhost:3000` で動かす最新版は、この `deploy` フォルダ直下の構成です。

```text
deploy/
  index.html
  style.css
  script.js
  server.js
  package.json
  package-lock.json
  data/
    obd-codes.json
    obd-monitor-definitions.json
    generic-obd-codes-modern.json
    generic-obd-codes-modern-2026.json
    generic-obd-codes-modern-2026-part2.json
    generic-obd-codes-modern-2026-part3.json
    generic-obd-codes-modern-2026-part4.json
    generic-obd-codes-modern-2026-part5.json
    generic-obd-codes-modern-2026-part6.json
    generic-obd-codes-modern-2026-part7.json
    generic-obd-codes-modern-2026-part8.json
    generic-obd-codes-modern-2026-part9.json
    generic-obd-codes-modern-2026-part10.json
    generic-obd-codes-modern-2026-part11.json
    generic-obd-codes-modern-2026-part12.json
    generic-obd-codes-modern-2026-part13.json
    generic-obd-codes-modern-2026-part14.json
    generic-obd-codes-modern-2026-part15.json
    generic-obd-codes-modern-2026-part16.json
    generic-obd-codes-modern-2026-part17.json
    generic-obd-codes-modern-2026-part18.json
    generic-obd-codes-modern-2026-part19.json
    generic-obd-codes-modern-2026-part20.json
    generic-obd-codes-modern-2026-part21.json
    generic-obd-codes-modern-2026-part22.json
    generic-obd-codes-modern-2026-part23.json
    generic-obd-codes-modern-2026-part24.json
    generic-obd-codes-modern-2026-part25.json
    generic-obd-codes-modern-2026-part26.json
    generic-obd-codes-modern-2026-part27.json
    generic-obd-codes-modern-2026-part28.json
    generic-obd-codes-modern-2026-part29.json
    generic-obd-codes-modern-2026-part30.json
    generic-obd-codes-modern-2026-part31.json
    generic-obd-codes-modern-2026-part32.json
    generic-obd-codes-modern-2026-part33.json
    generic-obd-codes-modern-2026-part34.json
    generic-obd-codes-modern-2026-part35.json
    generic-obd-codes-modern-2026-part36.json
    generic-obd-codes-modern-2026-part37.json
    generic-obd-codes-modern-2026-part38.json
    generic-obd-codes-modern-2026-part39.json
    generic-obd-codes-modern-2026-part40.json
    generic-obd-codes-modern-2026-part41.json
    generic-obd-codes-modern-2026-part42.json
    generic-obd-codes-modern-2026-part43.json
    generic-obd-codes-modern-2026-part44.json
    generic-obd-codes-modern-2026-part45.json
    generic-obd-codes-modern-2026-part46.json
    generic-obd-codes-modern-2026-part47.json
    generic-obd-codes-modern-2026-part48.json
    generic-obd-codes-modern-2026-part49.json
    generic-obd-codes-modern-2026-part50.json
    generic-obd-codes-modern-2026-part51.json
    generic-obd-codes-modern-2026-part52.json
    generic-obd-codes-modern-2026-part53.json
    generic-obd-codes-modern-2026-part54.json
    generic-obd-codes-modern-2026-part55.json
    generic-obd-codes-modern-2026-part56.json
    generic-obd-codes-modern-2026-part57.json
    generic-obd-codes-modern-2026-part58.json
    generic-obd-codes-modern-2026-part59.json
    generic-obd-codes-modern-2026-part60.json
    generic-obd-codes-modern-2026-part61.json
    generic-obd-codes-modern-2026-part62.json
    generic-obd-codes-modern-2026-part63.json
    generic-obd-codes-modern-2026-part64.json
    generic-obd-codes-modern-2026-part65.json
    generic-obd-codes-modern-2026-part66.json
    generic-obd-codes-modern-2026-part67.json
    generic-obd-codes-modern-2026-part68.json
    generic-obd-codes-modern-2026-part69.json
    generic-obd-codes-modern-2026-part70.json
    generic-obd-codes-modern-2026-part71.json
    generic-obd-codes-modern-2026-part72.json
    generic-obd-codes-modern-2026-part73.json
    generic-obd-codes-modern-2026-part74.json
    generic-obd-codes-modern-2026-part75.json
    generic-obd-codes-modern-2026-part76.json
    generic-obd-codes-modern-2026-part77.json
    generic-obd-codes-modern-2026-part78.json
    generic-obd-codes-modern-2026-part79.json
    generic-obd-codes-modern-2026-part80.json
    generic-obd-codes-modern-2026-part81.json
    generic-obd-codes-modern-2026-part82.json
    generic-obd-codes-modern-2026-part83.json
    generic-obd-codes-modern-2026-part84.json
    generic-obd-codes-modern-2026-part85.json
    generic-obd-codes-modern-2026-part86.json
    generic-obd-codes-modern-2026-part87.json
    generic-obd-codes-modern-2026-part88.json
    generic-obd-codes-modern-2026-part89.json
    generic-obd-codes-modern-2026-part90.json
    generic-obd-codes-modern-2026-part91.json
    generic-obd-codes-modern-2026-part92.json
    generic-obd-codes-modern-2026-part93.json
    generic-obd-codes-modern-2026-part94.json
    generic-obd-codes-modern-2026-part95.json
    generic-obd-codes-modern-2026-part96.json
    generic-obd-codes-modern-2026-part97.json
    generic-obd-codes-modern-2026-part98.json
    generic-obd-codes-modern-2026-part99.json
    generic-obd-codes-modern-2026-part100.json
    generic-obd-codes-modern-2026-part101.json
    generic-obd-codes-modern-2026-part102.json
    generic-obd-codes-modern-2026-part103.json
    generic-obd-codes-modern-2026-part104.json
    generic-obd-codes-modern-2026-part105.json
    generic-obd-codes-modern-2026-part106.json
    generic-obd-codes-modern-2026-part107.json
    generic-obd-codes-modern-2026-part108.json
    generic-obd-codes-modern-2026-part109.json
    generic-obd-codes-modern-2026-part110.json
    generic-obd-codes-modern-2026-part111.json
    generic-obd-codes-modern-2026-part112.json
    generic-obd-codes-modern-2026-part113.json
    generic-obd-codes-modern-2026-part114.json
    generic-obd-codes-modern-2026-part115.json
    generic-obd-codes-modern-2026-part116.json
    generic-obd-codes-modern-2026-part117.json
    generic-obd-codes-modern-2026-part118.json
    generic-obd-codes-modern-2026-part119.json
    generic-obd-codes-modern-2026-part120.json
    generic-obd-codes-modern-2026-part121.json
    generic-obd-codes-modern-2026-part122.json
    generic-obd-codes-modern-2026-part123.json
    generic-obd-codes-modern-2026-part124.json
    generic-obd-codes-modern-2026-part125.json
    generic-obd-codes-modern-2026-part126.json
    generic-obd-codes-modern-2026-part127.json
    generic-obd-codes-modern-2026-part128.json
    generic-obd-codes-modern-2026-part129.json
    generic-obd-codes-modern-2026-part130.json
    generic-obd-codes-modern-2026-part131.json
    generic-obd-codes-modern-2026-part132.json
    generic-obd-codes-modern-2026-part133.json
    generic-obd-codes-modern-2026-part134.json
    generic-obd-codes-modern-2026-part135.json
    generic-obd-codes-modern-2026-part136.json
    generic-obd-codes-modern-2026-part137.json
    generic-obd-codes-modern-2026-part138.json
    generic-obd-codes-modern-2026-part139.json
    generic-obd-codes-modern-2026-part140.json
    generic-obd-codes-modern-2026-part141.json
    generic-obd-codes-modern-2026-part142.json
    generic-obd-codes-modern-2026-part143.json
    generic-obd-codes-modern-2026-part144.json
    generic-obd-codes-modern-2026-part145.json
    generic-obd-codes-modern-2026-part146.json
    generic-obd-codes-modern-2026-part147.json
    generic-obd-codes-modern-2026-part148.json
    generic-obd-codes-modern-2026-part149.json
    generic-obd-codes-modern-2026-part150.json
    generic-obd-codes-modern-2026-part151.json
    generic-obd-codes-modern-2026-part152.json
    generic-obd-codes-modern-2026-part153.json
    generic-obd-codes-modern-2026-part154.json
    generic-obd-codes-modern-2026-part155.json
    generic-obd-codes-modern-2026-part156.json
    generic-obd-codes-modern-2026-part157.json
    generic-obd-codes-modern-2026-part158.json
    generic-obd-codes-modern-2026-part159.json
    generic-obd-codes-modern-2026-part160.json
    generic-obd-codes-modern-2026-part161.json
    generic-obd-codes-modern-2026-part162.json
    generic-obd-codes-modern-2026-part163.json
    generic-obd-codes-modern-2026-part164.json
    generic-obd-codes-modern-2026-part165.json
    generic-obd-codes-modern-2026-part166.json
    generic-obd-codes-modern-2026-part167.json
    diagnostic-workflows.json
    component-inspection-flows.json
    component-inspection-flows-exam-2026.json
    component-inspection-flows-exam-2026-part2.json
    dtc-family-workflows-2026.json
    dtc-scope-rules.json
    dtc-standards-reference-2026.json
    imported-verified-dtc.json
    exam-review-queue-2026.json
    exam-reference-catalog.json
    vehicle-patterns.json
    vehicle-patterns-domestic-2026.json
    vehicle-input-options.json
    vehicle-model-catalog-domestic-2004-2026.json
    vehicle-model-catalog-domestic-2026.json
    vehicle-year-ranges-domestic-2026.json
    recalls-tsb-notes.json
    official-reference-notes-2026.json
    japan-obd-inspection-notes.json
    japan-obd-inspection-notes-2026.json
    real-world-cases.json
    service-notes.json
    symptom-flows.json
  netlify.toml
  .nojekyll
  .env.example
  AGENTS.md.txt
  README.md
```

この構成ではOpenAI APIキーを使用しません。AI相談は外部GPT連携方式です。

## 起動方法

Node.jsとnpmを利用できる環境が必要です。起動・検証コマンドは固定のインストール先ではなく、PATH上の `node` を使用します。別PCへの移行時は `node --version` と `node -p "process.arch"` を確認してください。Nodeの版・32/64ビットは移行先の環境に依存し、J2534ドライバーとの適合確認は別途必要です。依存関係を初回導入した後のローカル起動にはインターネット接続は不要ですが、Node同梱の配布パッケージではありません。

PowerShellで次のフォルダへ移動します。

```powershell
cd "C:\Users\nagatomo\OneDrive\ドキュメント\自動車整備ツール\deploy"
```

初回、または `package.json` が変わった時だけ依存関係を入れます。

```powershell
npm install
```

サーバーを起動します。

```powershell
npm start
```

ブラウザで開きます。

```text
http://localhost:3000
```

PowerShellを閉じるか `Ctrl + C` を押すとサーバーは停止します。

## 別PCへのオフライン移行

開発元の `deploy` で `npm run package:workstation` を実行すると、`workstation-packages/vehicle-diagnosis-tool-{版番号}` に移行用フォルダーを作成します。公開資材一覧、必要なPC側スクリプト、lockfileに登録された導入済み依存ライブラリとライセンス類をまとめます。Node本体・VCIドライバー・ブラウザー内の保存事例・一覧外の個人ファイルは含めません。

移行先にNode.js 22以降とnpmを事前導入し、作成されたフォルダー全体をUSB等で移してください。Node.js 24 LTSを推奨します。`start-workstation.cmd` を開けば、追加の `npm install` やインターネット接続なしでPC版を起動できます。移行先の32/64ビットとVCI適合は別途確認が必要です。実車対応や車両送信の権限は変更しません。

ランチャーは古いNode.jsを依存ライブラリ確認前に拒否し、PC版の起動処理でもポート待受け前に版を確認します。Node.js 22以降という条件は最低条件であり、すべての版・機器の動作保証ではありません。[公式のリリース状況](https://nodejs.org/en/about/previous-releases)に従い、保守中のLTS系列の更新版を使用してください。ソフトの自動導入・更新は行いません。

PC版ランチャーのHTTP配信は、起動時に検証したオフライン資材一覧と一覧ファイル自体に限定します。起動スクリプト、依存ライブラリ、一覧外のログ・保存ファイルは配信しません。画面資材はGET/HEADのみ、ローカルブリッジは従来の認証付きPOSTを維持します。これはPC版ランチャーの制限であり、開発用の `npm start` や公開ホスティング設定を変更するものではありません。

作成時は資材の読込・版一致、導入ライブラリとlockfileの版一致を確認します。ダウンロードや自動インストールはしません。同じ版の出力が既にある場合は上書きせず、同時作成も拒否します。作成失敗時はその処理専用の一時フォルダーだけを片付けます。異常終了後に作成ロックが残った場合は、他の作成処理が動作していないことを確認してから調査してください。依存ライブラリの内容の真正性や、配布後の改変を保証する検査ではありません。

3.13.326以降の移行用フォルダーには、全同梱ファイルのサイズとSHA-256を記録した `package-integrity.json` と `verify-workstation.cmd` を含めます。移行先で `verify-workstation.cmd` を開くと、インターネットや追加ライブラリなしでコピー後の欠落・内容不一致を検査できます。失敗時は対象の相対パスを表示して終了し、修復・削除・車両通信はしません。元のパッケージを一式移し直して再検査してください。

3.13.327以降の移行用パッケージでは、`start-workstation.cmd`、`npm start`、`npm run workstation:dev` の通常起動で内容検査を先に実行します。不一致時は画面サーバーとブリッジを起動しません。CMDは `package-info.json` または `package-integrity.json` の存在で移行用フォルダーを識別します。両方を削除した場合やPC側スクリプトを直接実行した場合まで防ぐ仕組みではありません。開発用deployの通常起動は従来どおりです。検査後の変更を監視する機能や署名検証ではなく、起動ごとに1回のコピー内容検査です。

この検査は同梱一覧との一致確認です。署名検証ではなく、一覧や検査プログラム自体も変更された場合の真正性を保証しません。作成元の正しさ、実車適合、車両送信の許可も証明しません。検査一覧そのものと一覧外の追加ファイルは対象外です。診断セッションJSONの形式とは別で、個人の保存結果はパッケージへ追加しません。開発元では `npm run validate:package` で破損・欠落・不正パスを含む検証を実行できます。

## 構造化PID入力の数値検証

3.13.328以降、ライブPIDとフリーズフレームの構造化入力では、数値定義の項目を有限の数値または十進数文字列として検証します。`null`、欠損、空文字、真偽値、配列、オブジェクトを0や1に変換しません。16進数形式、単位付き文字列、非有限値、160文字を超える数値文字列、非ゼロ文字列が浮動小数点変換で0になる値も除外します。実測の0、負数、小数、指数表記は保持します。既存のnullishな別名選択、RAW未復号値、文字列型・真偽型PIDの扱いは変えません。

除外時は `invalid_pid_numeric_value` を記録し、正常な空応答や読取完了にしません。JSONの明示的な「取得済み」状態でも上書きせず、エクスポートと再読込後も失敗状態を保持します。フリーズフレームのエラーは既存のセッション集約方針に従い `blocked`、ライブPIDは `unparsed` として扱います。ECU別入力では不正値を含むECUを未解析とし、そのECUの値は集計対象外にします。他ECUの有効な値は維持します。タイムスタンプ付きCSVでも、最新の不正な読取を古い正常値で置き換えません。

3.13.329以降、CSVのライブPID・フリーズフレーム値は、識別情報のマスクと空白の整形後、切り詰めずに共有PID正規化処理へ渡します。160文字を超える数値セルを途中で切って0や別の数値に変換しません。区切り文字がカンマ・セミコロン・タブの表、複数表、時系列、JSON保存後の再読込でも拒否状態を保持します。文字列型PIDの表示上限160文字と入力全体の上限500,000文字は維持します。Mode06・ECU情報・車両情報など、他のCSV読取区分のセル処理は変更していません。

3.13.330以降、正規化済みの `monitorValues` を内部セッション・要約・取得率のAPIへ直接渡す場合も、既知の数値PIDの不正値を検査します。別名配列とECU別配列を確認し、不正値がある場合だけ除外・失敗状態の保持・現在の件数と相関ヒントの再計算を行います。失敗したECUの値は親の集計に戻さず、正常な別ECUや親ECU由来の値、残す行の付帯情報を維持します。正常な入力は再構築せず、メーカー固有の未登録項目・RAW値も従来の扱いを維持します。

この直接入力の検査は既知PIDの数値拒否条件を確認するもので、未登録項目の意味や車種適合、過去に取り込んだ分析履歴の正しさを保証するものではありません。別名や件数など保存形式全体の全面検証ではなく、不正数値の検出時に関連する集計を修復します。車種別正常範囲の追加、診断ロジックの簡略化、車両通信・消去・作動系の開放は行いません。

## 主な機能

- 診断補助
- 問診
- 整備事例登録
- 事例検索
- CSVエクスポート
- JSONバックアップ
- JSONインポート
- アプリ保存データ全削除
- 実運用前チェック
- 外部GPT相談文コピー

## データ構造

現代車対応のため、データを用途別に分けています。すべてJSON配列で、将来CSV/JSONインポートしやすい形にしています。

```text
data/obd-codes.json
  従来の主要な汎用OBD2コード

data/generic-obd-codes-modern.json
  通信系、ハイブリッド、高電圧、メーカー独自コード範囲など現代車向け汎用DTCメモ

data/vehicle-patterns.json
  メーカー、車種、年式、エンジン型式、パワートレインで絞り込む車種別傾向

data/vehicle-patterns-domestic-2026.json
  国産車の入力条件から絞り込む参考フロー。車種固有の故障断定には使用しない

data/vehicle-input-options.json
  メーカー、車種、型式、エンジン型式の段階選択に使う入力補助候補。車検証とメーカー資料の確認を優先する

data/vehicle-model-catalog-domestic-2004-2026.json
  平成16年（2004年）以降の旧型・生産終了車を含む履歴車名候補。車名選択を補助する層であり、全型式の登録完了を意味しない

data/vehicle-model-catalog-domestic-2026.json
  国産13メーカーの車名候補カタログ。型式やエンジン型式は推測で補わず、詳細候補JSONと手入力で補完する

data/vehicle-year-ranges-domestic-2026.json
  公式カタログ等で確認できた型式の年式候補。型式と年式からエンジン型式候補を絞る。月単位の境界を断定せず、車検証とメーカー資料の照合を優先する

2026-06-27時点で、現行・履歴を合わせた車名候補341件、型式・エンジン型式まで持つ詳細候補313車種、年式範囲769件、DTC records 3486件を登録しています。未登録の組み合わせは推測で補わず、手入力とメーカー資料確認へ戻します。
汎用DTCは既存登録のP3497、U059FおよびU3000～U3011まで名称を確認し、P084F、P085A～P085F、P086A～P086F、P087A～P087F、P088C～P088F、P089A～P089F、P090A～P090F、P095A～P095F、P099A～P099F、P0C88～P0FFF、P1010～P1FFF、P201B～P201F、P20F8～P20FF、P210F、P211A～P211F、P212F、P214A～P214F、P215D～P215F、P218A～P218F、P219A～P21FF、P220A～P220F、P223A～P223F、P226C～P226F、P227A～P227F、P229E～P229F、P230A～P230F、P2348～P23FF、P240D～P240F、P248A～P24FF、P2593～P259F、P261E～P261F、P262A～P262F、P263A～P263F、P264F、P265F、P266F、P267F、P26A3～P26FF、P270A～P270F、P271A～P271F、P272A～P272F、P273C～P273F、P2757、P27A1～P27FF、P280C～P280F、P285B～P29FF、P2A0A～P2A0F、P2A12～P2BA6、P2BAF～P2FFF、P3001～P30FF、P3101～P31FF、P3201～P32FF、P3301～P33FF、P3498以降、U0075～U009F、U029F、U0337～U03FF、U041A、U041F、U043D～U0440、U044B～U0450、U045B～U0460、U046C～U0470、U048B～U0490、U049B～U0500、U050B～U0510、U051B～U0520、U052B～U0530、U053E～U0540、U054C～U0550、U055F～U0560、U0566～U0586、U058B～U0591、U05A0～U2FFF、U3012以降の未登録範囲は公式資料の確認待ちです。インバーター過熱、位置学習、トルク性能、補助トランスミッションフルードポンプ制御モジュール内部温度センサー回路、補助トランスミッションフルードポンプ相回路・制御モジュール回路・モーター電流・フィードバック信号、内部制御モジュール駆動モーター/ジェネレーター－エンジン回転速度センサー性能、ハイブリッドバッテリーSOC・冷却系・温度センサーF/G/H、DC/DCコンバーター温度センサーA/B、ハイブリッドバッテリー冷却水温・冷却ポンプ制御、駆動モーターA/B位置学習限界、駆動モーターA/B位置センサー回路A/B、ジェネレーター位置センサー回路A/B、ハイブリッドバッテリー温度センサー相関、プリチャージ/放電時間、インバーター電圧過大、メーカー制御DTC、NOx吸蔵触媒、DPF、吸気ランナー、EVAP燃料蒸気温度、燃焼式ヒーター、排気温度センサー、還元剤噴射エア圧力/エアポンプ、還元剤温度/圧力/噴射バルブ/システム性能、還元剤レベル、還元剤タンクヒーター/タンク温度、還元剤漏れ/噴射/再生供給、還元剤品質、還元剤ポンプ、還元剤パージ/エア圧制御バルブ、還元剤メータリングユニット温度/ヒーター、還元剤ヒーターA/B/C/D、排気後処理燃料インジェクターA/B、排気後処理燃料供給制御/燃料圧センサー、排気温度センサー相関、還元剤圧力/消費量、還元剤噴射バルブ開固着、還元剤制御モジュール電源リレー、SCR NOx触媒過温/効率、スロットルアクチュエーター制御、スロットル/ペダル位置センサーD/E/F/G回路・最小停止位置・相関、EGRスロットル/ベント制御、燃料インジェクターグループA/B/C/D/E/F/G/H供給電圧、車速/ホイール速/出力軸速相関、車速センサーB、スロットル/ペダル位置センサーA/B/C/D/E/F最大停止位置、排気圧レギュレータベント制御、スロットル制御空気流量/アイドル位置学習、アイドル以外/アイドル時/高負荷時の空燃比リーン/リッチ、O2センサー信号偏り/固着/入れ替わり/ヒーター回路短絡/正電流制御/負電流制御/基準電圧/減速時範囲外、二次空気噴射制御/切替バルブ/ポンプ/高流量、過給機バイパス/過給圧性能、燃料中水分センサー/警告灯制御、吸気系漏れ/制限、インジェクター制御圧、燃料圧レギュレーター制御/学習限界、ブレーキ/アクセルペダル位置不整合、点火コイル一次制御/二次回路、シリンダー別ノック閾値超過、EVAPリーク検出ポンプ/燃料キャップセンサー/切替バルブ、EGR性能/冷却バルブ/クーラーバイパス、O2センサー排気サンプル/信号入れ替わり、HC吸着触媒効率、排気温度過高/センサー回路/範囲外、DPF灰分堆積/すす堆積/差圧/再生温度/圧力センサー/再生時間/車両条件/出力制限/センサー相関、二次空気流量/圧力センサー、吸気温センサー相関、冷却システム性能、冷却水温センサー2回路、NOxセンサー回路/ヒーター制御/ヒーター検出、大気圧センサーA/B、燃料噴射/燃料ポンプ強制エンジン停止、燃料レベルセンサーB、カムシャフト位置アクチュエーター制御、触媒後燃料補正、MAP/MAF/スロットル相関、スロットル氷結閉塞、IMTバルブ固着/位置センサー、触媒過温、充電系電圧/発電機L端子、ECM/PCM電源入力、エンジンオイルレベル、ECM/PCM電源リレー検出、EDR要求、A/C冷媒圧/要求、PTO有効化/停止回路、バキュームリザーバー圧力、エンジンオイル品質、イグニッションスイッチRUN/START/ACC、低圧燃料システムセンサー、PTO検出/速度選択、トルク管理要求、エンジンフードスイッチ、エンジンオイル劣化、スロットル/燃料禁止、エンジン冷却水レベル、PTO速度選択2、A/C要求A/B、ターボチャージャーブースト制御位置センサーA/B・速度センサー、直接オゾン還元触媒温度/劣化/効率、アイドル速度選択、バキュームリザーバー/ポンプ制御、エンジンフードスイッチ範囲/低/高入力、前方距離レンジセンサー、燃料添加剤制御モジュール、トルク管理要求出力、ターボチャージャーブースト制御位置センサーB断続、前方距離レンジセンサー左/右、冷却水ポンプA/B、吸気ヒーターA/B、PTO制御、DPF再生ランプ、EVAP監視プロセッサ、ECM/PCM内部停止タイマー、A/C冷媒分配バルブ、カム/クランク位置信号出力、スロットル位置出力、インジェクター制御圧レギュレーター、O2センサーポンピング電流トリム、燃料ポンプB制御、燃料ポンプA/B低流量、トルク管理フィードバック信号A/B、ロッカーアームアクチュエーターA/B制御/位置センサー、燃料遮断バルブB、アクチュエーター供給電圧B/C、インジェクションポンプ/インジェクター/高圧燃料ポンプ校正、エアクリーナー入口制御、冷却水脱気/バイパスバルブ、燃料供給ヒーター、インジェクターデータ不適合、排気後処理燃料インジェクターA/グロープラグ、トランスミッション摩擦要素適用時間、シフトソレノイドF、圧力制御ソレノイドD/E/F、油圧パワーユニット漏れ、トランスミッションフルード温度センサーB、中間軸速度センサーB/C、トランスミッションフルードクーラー制御、トルクコンバータークラッチ圧力制御ソレノイド/回路、入力/タービン速度センサーB、4WDロー/レンジ信号、アップ/ダウン/キックダウンスイッチ、クラッチ/シフト温度、適応学習限界、補助トランスミッションフルードポンプ、トランスファーケースギヤ比、トランスミッションレンジセンサーB/相関/未学習、圧力制御ソレノイドG/H/J/K、シフトフォークA/B/C/D位置センサー/固着/意図しない移動、クラッチA/B圧力チャージ/ディスチャージ/係合/解放性能、O2センサー範囲/性能・負電圧、NOx超過/還元剤/EGR関連、メーカー制御P3xxx、シリンダー休止/吸気・排気バルブ制御、CAN/車両通信バスU0002～U0074、制御モジュール通信喪失U0102～U029E、ソフトウェア不整合U0300～U0336、無効データ受信U0400～U059F、制御モジュール/電源/接地/イグニッション入力U3000～U3011までを収録し、高電圧回路、燃料蒸気、後処理系、排気高温部、電子スロットル可動部、点火高電圧、燃料系、冷却系、走行速度系、充電系、電源系、潤滑系、A/C高圧冷媒、PTO駆動部、SRS/安全系周辺、真空/ブレーキ補助系、始動系、ADAS/クルーズ制御の対象区分、端子、基準値、測定条件、校正条件はメーカー整備書確認を必須とします。

OBD2車両読取タブは、将来のUSBシリアル接続によるDTC、フリーズフレーム、リアルタイムデータ表示専用です。現段階では通常利用者には車両接続を開放せず、開発者ゲート内だけで読取テストを進めます。外部診断機の読取結果を貼り付ける機能は診断補助へ統合し、現在は外部診断機の結果から診断を開始し、将来は車両読取結果を問診、診断手順、ライブデータ解析へ直接引き継ぐ構成にしています。データモニター辞書は `data/obd-monitor-definitions.json` で管理し、エンジン、燃料、吸排気、排出ガス、過給、ディーゼル後処理、トルク、変速機、ハイブリッド、状態情報など152項目を登録しています。主要診断ワークフローには推奨モニターID、観察条件、解析上の注意を関連付け、車両が対応して返した項目だけを表示対象にし、未取得値や正常範囲は推測補完しません。外部診断機ログでは、電源電圧、燃料補正、温度差、停止/運転状態などの相関ヒントを表示し、正常/異常の断定ではなく次の確認条件へつなぎます。車両接続、DTC読取、フリーズフレーム取得、リアルタイムデータモニター、DTC消去は機能単位で準備します。Web Serial接続プロファイル、通信速度候補、停止条件、保存DTC読取、保留DTC読取、フリーズフレーム取得、対応PID確認、主要ライブデータ取得、DTC消去要求の通信準備を定義しています。高度な通信はWeb Serial、ローカル通信ブリッジ、J2534 Pass-Thru、UDS/CAN/CAN FD、DoIP、専用VCI SDKの順に分け、ブラウザUIと車両通信層を直接結合しない構成で進めます。ローカル通信ブリッジはAPI契約、候補ポート、読取Intent、遮断する変更系Intent、ペアリング条件、ログ方針、ステータス/VCI一覧/DTC/ライブPID/セッション概要の応答型を定義し、PC側の読取専用サンプルブリッジ `local-bridge-readonly.js` でWeb側との疎通を確認できます。実車へ送信する操作は内部ガードで無効化し、変更系要求は失敗時安全停止で拒否します。公開UIでは通常利用者に不安を与えないよう接続機能の準備状況として表示し、詳細な保護条件は技術メモへ折りたたみます。DTC消去、EPB整備モード、ABSエア抜き、アクティブテスト、セキュリティアクセス、書込み系サービスは、車種適合、実行条件、利用者確認、記録、失敗時の復旧、安全警告を機能ごとに確立してから段階的に有効化します。v3.13.273ではEPB整備モード、ABSエア抜き、アクティブテストを含む未開放サービス機能の安全条件プランを診断セッション、bridge export、JSON再読込へ統合し、保存済みデータに実行許可フラグが混入してもこのWeb版から車両コマンドを送信しないことを検証します。

### 開発用ローカルブリッジ

PC側サンプルブリッジを起動する場合は、ブラウザ側の開発トークンと同じ値を環境変数へ設定します。

```powershell
$env:LOCAL_BRIDGE_PAIRING_TOKEN="任意の12文字以上のトークン"
$env:LOCAL_BRIDGE_PORT="8765"
npm.cmd run bridge:dev
```

WindowsでJ2534 Pass-Thruドライバの登録を確認する場合は、起動前に次を設定します。これはWindowsレジストリを照会し、登録済みDLLを実行・ロードせずにファイルとして静的解析します。VCIや車両へ通信しません。

```powershell
$env:LOCAL_BRIDGE_DISCOVER_J2534="1"
npm.cmd run bridge:dev
```

ブリッジを起動せず、登録済みJ2534ドライバと静的DLL適合性だけを確認する場合は次を実行します。出力にはローカルDLLパスを含めず、ネットワーク共有パスは解析前に拒否します。VCIや車両へ通信しません。

```powershell
npm.cmd run inspect:j2534
```

候補番号を明示するか対話入力で選択した場合だけ、同じ非実行workerが固定ドライブ、ファイル同一性、SHA-256、PE構成に加えてWindowsの`WinVerifyTrust`署名ポリシーを確認します。署名確認はUIを出さず、ネットワーク取得を禁止してローカルキャッシュだけを使います。未署名またはWindowsが信頼済みと判定できないDLLは拒否します。これはDLLをロードせず、`PassThruOpen`や車両通信を行いません。コマンドから1件を選ぶ場合は `npm.cmd run inspect:j2534 -- --preflight-index 1` のように指定します。

PC配布パッケージ内のJ2534操作は、package-integrity.jsonとのコピー一致を操作発行時と実行直前に再検証し、途中で不一致・欠落が発生した場合はnative workerを起動せず拒否します。この証拠は内部の一回限り操作にだけ保持し、画面や呼出し元から渡した真偽値では代用できません。これは配布物のコピー破損検出であり、発行者の真正性、J2534適合、DLLロード許可、車両通信許可を示しません。整合性一覧を持たない開発ソースツリーからはこの操作を発行しません。

### PC内で画面と確認ブリッジをまとめて起動

Node.jsと、この`deploy`フォルダの依存パッケージを導入済みのPCで実行します。

Windowsでは `deploy/start-workstation.cmd` をダブルクリックすると、フォルダ移動やコマンド入力なしで起動できます。画面と確認ブリッジの準備完了後に、既定のブラウザーで診断画面を開きます。ブラウザーを開けない場合もサーバーは維持するので、表示された診断画面URLを手動で開いてください。ペアリング値はURLに含めません。`start-workstation.cmd --no-browser` は自動表示なし、検証用の `--no-pause` は自動表示と終了時の一時停止なしで起動します。npm経由では自動表示せず、必要な場合だけ `npm run workstation:dev -- --open-browser` を指定します。Node.jsや依存パッケージが不足している場合は起動せず、理由を表示します。自動ダウンロード・インストールはしません。実行ファイルだけを別の場所へ移動せず、必要ならこのファイルへのショートカットを作成してください。
起動時のウィンドウには今回のペアリング値を表示するため、その内容を外部共有しないでください。起動ウィンドウは利用中そのまま残し、終了は `q` を入力してEnterを押します。`exit` と `Ctrl+C` も利用できます。コマンド起動時の標準入力が終了（EOF）した場合も、診断画面と確認ブリッジを終了して両方のポートを解放します。入力を閉じたバックグラウンド起動には対応しません。プログラムからの `startLocalWorkstation()` 呼出しは従来どおり明示的な `close()` で終了します。コマンドから使う場合は次の方法も引き続き利用できます。

PC版の起動前に `offline-assets.json` の一覧・件数、必須画面資材とブリッジ本体、一覧にある各ファイルの読込可否、画面・サービスワーカー・一覧の版一致を確認します。不備がある場合は対象ファイルと一式復元の案内を表示し、ブリッジ作成・ポート待受・接続キー表示へ進みません。配布フォルダー外への参照、空ファイル、1MiBを超える一覧、2,000件を超える一覧、64MiBを超える個別ファイルは拒否します。ファイルの自動補充・書換えは行いません。この確認は起動時点の一覧と読込確認であり、一覧と実ファイルの両方から除かれた辞書、同じ版の内容改変、ブラウザのオフラインキャッシュ状態、実車適合を保証するものではありません。

```powershell
npm.cmd run workstation:dev
```

- 診断画面は `http://127.0.0.1:3001`、J2534静的確認ブリッジは `http://127.0.0.1:8765` です。両方とも同じPCからだけアクセスできます。
- 詳細メニューは従来の詳細トークンで解除し、起動時に表示されるペアリング値を「ブリッジ接続キー（今回のみ）」へ入力して「適用」します。値は外部共有しないでください。環境変数で指定しなければ起動ごとに生成され、ファイルには保存しません。
- 終了は起動ウィンドウで `q` + Enter（または `exit`、`Ctrl+C`）です。「診断画面と確認ブリッジを終了しました。」の表示後に終了します。処理中のHTTP接続も終了対象です。終了操作は車両への要求を送信しません。起動途中でポート競合が起きた場合、今回起動したサーバーだけを終了します。他のプログラムは停止しません。
- 画面用ポートが使用中なら `$env:PORT="3002"`、ブリッジ用は必要に応じて `$env:LOCAL_BRIDGE_PORT="17653"` を設定してから起動します。
- 3.13.331以降、ポート競合では「診断画面用」または「確認ブリッジ用」とポート番号、変更する設定名を表示します。画面ポート変更時には保存領域が別になる注意も表示します。同じ固定ポートを両方へ設定した場合は起動前に拒否します。自動的なポート変更、既存プロセスの停止、使用中URLの自動表示は行いません。
- この起動方法の画面は、同時起動したブリッジを画面と同じURLの専用経路から優先して確認します。ポートを変更しても手入力は不要です。公開版や従来の画面サーバーでは、従来の8765 / 17653ポート探索を維持します。
- 今回の接続キーは画面のメモリ内だけに保持し、ロック・再読込で破棄します。「解除」で詳細トークンと共通の従来方式へ戻ります。適用だけでは車両通信も接続確認も行いません。新しい接続キーで既存の詳細トークンを解除・上書きすることはできません。
- 接続キーを個別入力しない従来方式では、起動前に `LOCAL_BRIDGE_PAIRING_TOKEN` を詳細トークンと同じ値に設定できます。どちらの方式もブリッジ側のキー照合と送信制限は維持します。
- 読取操作の結果は詳細メニューの状態欄に残ります。「接続キーが一致しません」は今回のキーを再入力、「VCI未検出」はPCの登録・接続状態を確認します。「VCIは未接続」はドライバー検出済みでも車両データを取得していない状態です。ブリッジ確認成功と実車読取成功は別です。
- ブリッジ確認・読取は一度に1件です。処理中は追加要求・接続キーの変更・プレビューへの切替を止め、Web Serial接続中もブリッジ要求を開始しません。ロック、接続キー解除、車両・方式変更で待機中の応答を破棄し、別ポートへの自動再試行も止めます。
- 中止はブラウザのHTTP待機と結果反映を止めるものです。PCブリッジ側や車両側の処理停止を保証するものではありません。ブラウザ側で中止前の要求の待機が終了するまで、新しい要求は受け付けません。
- 診断結果の外部取込みが成功すると、待機中の旧ブリッジ応答は反映しません。拒否ファイル・空入力・解析失敗では既存の読取を維持します。「クリア」でも旧応答の反映を止めますが、保存・比較用の直前セッションは従来どおり保持します。
- ファイル・クリップボードの取得待機中に新しい取込み、入力編集・解析、クリア、ロック、車両変更、スキャン開始、診断セッション更新があった場合、古い取得結果とエラーは反映しません。新しいファイルが不正な形式でも旧取得は無効にしますが、ファイル選択をキャンセルしただけなら旧取得を維持します。取得処理そのものを止めるのではなく、古い内容の画面反映を止める制御です。
- 画面のポートを変えるとブラウザの保存領域も別になります。既存の保存内容は元のURL側に残ります。
- 保存ログの混入を防ぐため、`LOCAL_BRIDGE_REPLAY_LOG` が設定されている場合は起動を拒否します。ログ再生は従来の `bridge:dev` を使います。
- ローカル資材はインターネットなしで配信できますが、外部GPTや資料リンクの閲覧にはインターネットが必要です。
- **この起動機能は実車読取を開放しません。** J2534登録とDLLの静的確認のみで、DLLロード、車両接続、DTC消去、車両送信は無効です。

ローカルブリッジの応答期限は接続先ごとの1要求につき20秒です。タイマー処理が遅れても、ヘッダー受信後とJSON本文の読込後に単調増加時計で期限を確認し、期限ちょうど以降の応答は採用しません。中止を期限切れより優先し、既存の接続先探索では各要求に新しい期限を設定します。探索全体の20秒以内完了や、ブラウザ・OS停止中の即時終了を保証するものではありません。中止できない通信が終了しない場合は、従来どおり重複要求を防ぐため待機中の扱いを維持します。診断値、保存形式、車両送信の有効範囲は変更しません。

Web SerialのELM327受信は、1応答の蓄積上限を12,000文字（復号後のJavaScript文字列長。終端プロンプト・空白を含む）としています。上限ちょうどは従来どおり扱い、超過した場合は応答を切り詰めず、受信バッファを破棄して切断します。初期化中も上限超過の理由を保持します。進行中の読取では、それ以前に完了した応答と通信失敗の記録だけを既存の部分読取処理へ渡し、次の要求は送りません。これは実車対応や送信権限の追加ではありません。

Web Serialで送信処理が未完了のまま切断・ロックした場合、送信処理が成功または失敗として終了するまで書込ハンドルの解放とポート終了を待ちます。その間の再接続・ブリッジ要求・重複送信を拒否し、遅れて届いた応答を新しい読取へ渡しません。この経路で後処理が失敗した場合も「終了未確認」として再接続禁止を維持します。画面の待機表示は車両側の停止確認ではありません。ストリームの解放とポート終了については[ChromeのWeb Serial資料](https://developer.chrome.com/docs/capabilities/serial#close-a-serial-port)を参照してください。

送信完了待ちにも各操作の待ち時間（通常2.5～3.5秒、ATZは5秒）を適用し、成功後に応答待ちの期限を別途開始します。期限切れでは読取・初期化・識別の呼出しを終了し、通信ハンドルを直ちに使用不可にします。実際の送信と後処理が終わるまでは再接続禁止を維持するため、ドライバーが応答しない場合の後処理時間は保証しません。タイマーが遅れて動く場合も単調増加時計で期限を照合しますが、ブラウザやOSが停止中の即時中断を保証するものではありません。期限切れ時は対応PID・FF能力・時系列・観察条件を保持して失敗記録へ引き継ぎ、次回のポートopen成功後に新しい接続用へリセットします。受信側の切断が先行した場合も、同じ操作が継続中で保存結果が置き換わっていない場合だけ退避情報を戻します。初回接続の期限切れは、送信開始時の初期化・識別段階を失敗記録に使います。自動再送・強制中断・実車通信の開放は行いません。

1件のELM327要求は、送信開始から終端プロンプト受信または失敗終了まで他の要求と混在させません。送信完了後の応答待ち中も重複する読取・手動識別・プロトコル確認を拒否し、受信バッファを上書きしません。応答期限はPCの壁時計ではなく単調増加時計で判定し、期限ちょうどに届いた内容は次の要求へ持ち越しません。切断時は論理上の要求所有権を解除しますが、未完了の実送信がある場合は従来どおり終了確認まで再接続を禁止します。手動識別のタイムアウト・通信エラーでは部分的な識別情報を保存せず、安全に切断します。DTC解析、保存形式、許可コマンド、車両送信の有効範囲は変更しません。

基本読取・クイック状態確認は、シリアル接続がreadyで読取・初期化・識別・他のスキャン・接続終了などが進行していない場合だけ、新しいスキャン用に結果を初期化します。処理中・未接続などによる通常の開始拒否では、読取結果、PID情報、時系列、ログ、取込み待機をリセットしません。外部取込みなどで結果が別のものに置き換わっている場合は例外として、従来の安全切断による旧通信の終了処理を開始します。取込み結果は保持しますが、通信側のPID情報・時系列などの作業領域は終了処理で初期化します。正常に開始した場合の読取順序と、古い取込み待機を無効にする動作は維持します。

Web Serialの接続状態を新しく記録する際は、読取試行がまだなくても、受信停止・受信上限超過・機器切断・応答／送信タイムアウトなどの明示的な通信失敗理由を成功扱いにしません。初期化失敗の理由も、初期化要約がない場合に保持します。通常の手動切断・ロック・機器選択キャンセルだけでは通信失敗を作りませんが、既に記録された失敗は消しません。接続失敗から車両故障、DTC、計測値を推測せず、既存の保存形式と送信禁止を維持します。この変更は既存の保存済み結果を自動で修正・再判定するものではありません。

複数の接続エラーが重なる場合の説明と次操作は、既存の状態判定と同じ優先順位（初期化、通信、車両接続、アダプター、機器選択・接続・識別）で表示します。通信エラーを先に案内する場合も、車両接続失敗などの記録は維持します。新しく生成する接続状態の案内だけを揃え、既存の取込結果の文言、診断値、保存形式、車両送信の有効範囲は変更しません。

結合検証は `npm.cmd run validate:workstation` で実行できます。
公開前の一括検証は `npm.cmd run validate:release` です。OBD（シリアルの寿命管理とセッション出力を含む）、ブリッジ、ローカル起動と画面操作、オフライン資材、診断辞書の順に実行し、失敗した段階で停止します。
v3.13.274からOBDとブリッジの検証件数は実行時に集計し、画面の件数表示と異なる場合も検証を失敗させます。個別スイートの件数であり、実車試験件数、対応車種数、完成率ではありません。今回の修正によって実車通信やサービス機能を開放するものではありません。
画面と同じID生成関数を使い、公開ステータス確認・認証付き読取要求・接続先探索をローカルHTTP経由で検証します。別の要求には別IDを付け、同じ要求の接続先探索ではIDを保持します。これはPCブリッジとの疎通確認であり、実VCI・実車との通信確認ではありません。
HTTP応答は要求ID、成功・拒否フラグ、送信無効フラグ、エラー配列とデータの外形を照合してから採用します。不一致・形式不正では現在の読取結果を置き換えません。正規の失敗応答は元の理由を表示し、通信先探索を続けません。この検証は応答内容の真正性や車種適合を保証するものではなく、保存ログの取込み形式は変更しません。

CANable/SavvyCAN/candumpなどで保存したログを再生する場合は、起動前にログファイルを指定します。

```powershell
$env:LOCAL_BRIDGE_REPLAY_LOG="C:\path\to\obd-can-log.txt"
npm.cmd run bridge:dev
```

Web側では同じ値を一度だけ設定します。

```js
localStorage.setItem("vehicle-diagnosis-obd-dev-token-v1", "任意の12文字以上のトークン")
```

このブリッジは読取専用サンプルです。`bridge_status`、`list_vci`、`read_stored_dtc`、`read_freeze_frame`、`read_live_pid_snapshot` などの読取応答を返し、DTC消去、作動要求、書込み、セキュリティアクセスは拒否します。ログ再生では `7E8#04410C1AF8`、`7E8 [4] 41 0C 1A F8`、SavvyCAN系CSVのような保存ログをDTC/フリーズフレーム/ライブPID/Mode01 PID01のMIL・DTC数・レディネス生ステータス応答へ変換します。標準PIDは燃料補正、燃圧、点火時期、吸気温、O2センサー、空燃比センサー電圧/電流、触媒温度、EGR、EVAP、始動後時間、消去後距離、燃料残量、大気圧、当量比、スロットル/アクセル、外気温、油温、燃料噴射時期、燃料消費率、要求/実/摩擦トルク系などの基本データモニター値を順次デコードします。

接続基盤の参考仕様:

- SAE J1979_202505: https://saemobilus.sae.org/standards/j1979_202505-e-e-diagnostic-test-modes
- Web Serial API: https://wicg.github.io/serial/
- Chrome Web Serial guide: https://developer.chrome.com/docs/capabilities/serial
冷却ファンの作動確認では、キーOFF後の自動作動を想定し、ファン周辺へ手や工具を入れないでください。

data/component-inspection-flows.json
  公開試験資料の基礎点検を参考に、単体点検と比較測定を実務向けに整理

data/component-inspection-flows-exam-2026.json
  問題用紙と正答表を対で確認し、転載せず実務向けに整理した単体点検フロー

data/component-inspection-flows-exam-2026-part2.json
  国土交通省の公開試験資料を根拠に追加した、点火、燃料、吸気、冷媒、ワイパー、配線の確認フロー

data/dtc-scope-rules.json
  個別登録がないDTCでも、P/B/C/U領域と最初の確認方針を安全に表示

data/dtc-family-workflows-2026.json
  個別定義が未登録でも診断開始点を示す、P/B/C/U領域と主要系列の初期整理

data/dtc-standards-reference-2026.json
  SAE J2012、J2012DA、NALTECなど標準・公式資料の参照台帳

data/imported-verified-dtc.json
  利用権を確認した正規データまたは検証済みCSVから生成する正式定義レイヤー

data/exam-review-queue-2026.json
  スキャン形式の公開試験PDFを目視対照するための検証待ち台帳

data/exam-reference-catalog.json
  参照した公開試験資料、確認日、除外ルール

data/recalls-tsb-notes.json
  リコール、改善対策、サービスキャンペーン、TSB確認用メモ

data/japan-obd-inspection-notes.json
  日本のOBD検査に関する確認メモ

data/real-world-cases.json
  実整備事例を蓄積するためのサンプル構造

data/service-notes.json
  整備要領、必要工具、注意事項

data/symptom-flows.json
  症状別の診断フロー
```

追加データの基本ルール:

- `source` と `source_date` を必ず持たせる
- 車種別情報は `maker`、`model`、`year_from`、`year_to`、`engine_code` で絞れる形にする
- メーカー独自コードは断定しない
- 登録データにない情報は「登録データなし」と扱う
- リコール、TSB、OBD検査対象可否は公式情報で最終確認する
- 試験問題は問題用紙と正答表を対で確認し、不適切出題や訂正対象を診断根拠へ使わない
- 未登録DTCは名称や原因を推測せず、メーカー整備書で定義を確認する

## データ検査

公開前に次を実行してください。

```powershell
npm.cmd run validate:data
npm.cmd run validate:dtc-import
```

JSON構文、文字崩れ、DTC形式、ID重複、整備書確認フラグ、出典URLの型、車両候補の文字列配列、年式範囲の重複を検査します。
`dtc-standards-reference-2026.json` は、公式HTTPS URL、現行J2012DAの一意性、旧版から現行版への後継参照、版コードとURL、公開日順序も検査します。版更新時は新しい行を `current` とし、旧版を `historical` に変更して `superseded_by` を設定してください。
`validate:dtc-import` は、検証済みDTC CSV取込でHTTPS出典、実在日付、将来日拒否を確認します。

登録済み個別DTCと系統別フローの状況は次で確認できます。

```powershell
npm.cmd run report:coverage
```

## 作業時トラブル対策

前回作業で止まりかけた箇所と、安全に進めるための対策です。

- Browserスキルが `windows sandbox failed: spawn setup refresh` で起動できない場合は、アプリ本体の不具合と断定しない。1回だけ再試行し、再発時はHTTP 200確認、公開JSON取得、車両候補の絞り込みロジック直接検証、実運用前チェック相当の直接検証へ切り替える。報告では「Browserのみ未実行」と明記する。
- 公開URL確認が通常権限で接続不可になる場合は、ネットワーク制限の可能性がある。`https://tool.mukiguri.com/`、`script.js`、`vehicle-input-options.json`、`vehicle-year-ranges-domestic-2026.json` の4件を、承認付きネットワーク実行でHTTP 200、APP_VERSION、件数、代表型式まで確認する。
- Git操作で `.git/index.lock` の作成権限エラーが出た場合は、作業ファイルを広くstageしない。変更したファイルだけを明示して、承認付きで `git add -- deploy/README.md deploy/data/vehicle-input-options.json deploy/data/vehicle-year-ranges-domestic-2026.json deploy/script.js` のように実行する。未追跡の `data/` と `pet-runs/` は追加しない。
- PowerShellのインライン検証で日本語リテラルが文字化けした場合は、その出力を根拠にしない。UTF-8の既存ファイルを直接読むか、検証用の日本語文字列はUnicodeエスケープまたはASCII識別子にして再実行する。
- ローカル配信確認では、画面操作ができない場合でも `http://localhost:3001/`、`script.js`、対象JSON 2件のHTTP 200を確認し、車種、型式、年式、エンジン型式の連動は公開ロジックと同じ条件で直接検証する。

## 検証済みDTC CSVの取込

SAE J2012DAなど利用権を確認した正規データは、CSV形式にしてから取り込みます。ExcelはCSV UTF-8形式で書き出してください。

まず書き込みを行わないドライランで検査します。

```powershell
node scripts/import-verified-dtc-csv.js `
  --input "C:\path\to\verified-dtc.csv" `
  --source "SAE J2012DA_202607 licensed dataset" `
  --source-url "https://saemobilus.sae.org/standards/j2012da_202607-digital-annex-diagnostic-trouble-code-definitions-failure-type-byte-definitions" `
  --source-date "2026-07-29"
```

検査結果を確認した後だけ、同じコマンドへ `--write` を追加します。出力先は `data/imported-verified-dtc.json` です。

既存のJ2012DA_202510由来定義は出典履歴として保持します。J2012DA_202607の正規データを入手・照合するまでは、版番号だけを根拠に名称や診断ガイダンスを自動更新しません。

基本列は `code,title` です。メーカー資料のサブコードまたはFTBがある場合は、`subcode` / `FTB` 列へ1〜4桁の16進数を入れるか、`B0001:11` のように `code` 列へ付けます。同じ定義に両方を指定した場合は一致が必要で、同じ `code + subcode` の重複は取込を中止します。

正式名称だけを取り込み、原因候補、端子番号、基準値は自動生成しません。診断手順はメーカー整備書を優先します。

## 外部GPT相談

「AI相談へ送る」ボタンを押すと、入力済みの車両情報、OBD2コード、症状、確認済みの事実、問診内容を相談文に整形してクリップボードへコピーします。

コピー案内を約1.3秒表示したあと、整備相談用GPTを新しいタブで開きます。

PCではGPT画面で `Ctrl + V`、スマホでは入力欄を長押しして「貼り付け」してください。

APIキーは使用しません。`script.js` にAPIキーを書かず、`server.js` でもAI APIを実行しません。

## Netlifyへ再デプロイするフォルダ

Netlifyへ再デプロイする場合は、次のフォルダを公開対象にしてください。

```text
C:\Users\nagatomo\OneDrive\ドキュメント\自動車整備ツール\deploy
```

Netlify設定:

```text
Build command: 空欄
Publish directory: .
```

環境変数やAPIキーの設定は不要です。

## GitHub Pagesで公開する場合

`deploy` フォルダの中身をGitHubリポジトリの公開対象にしてください。

GitHub Pages設定例:

```text
Source: Deploy from a branch
Folder: /root
```

`data` フォルダも必ず一緒に公開してください。

## プロジェクト整理メモ

### 完成版

次が現在使用中の完成版です。

```text
deploy/index.html
deploy/style.css
deploy/script.js
deploy/server.js
deploy/package.json
deploy/package-lock.json
deploy/data/
deploy/netlify.toml
deploy/.nojekyll
deploy/README.md
```

### 旧版

次は古い構成です。現在の `localhost:3000` では使用していません。

```text
deploy/deploy/
```

この中には旧API方式の `server.js` や `netlify/functions/ai-diagnosis.js` が残っています。

### バックアップ候補

次はバックアップまたは削除候補です。削除する前に必ず動作確認してください。

```text
data/
deploy/deploy/
deploy/netlify.zip
deploy/server.out.log
deploy/server.err.log
```

補足:

- ルート直下の `data/` と `deploy/data/` は現時点で同じ内容です。
- `localhost:3000` で参照されるのは `deploy/data/` です。
- `deploy/node_modules/` は `npm install` で再作成できます。
- `deploy/netlify/functions/` は現在空です。

## 推奨フォルダ構成

最終的には次のように整理すると迷いにくくなります。

```text
自動車整備ツール/
  deploy/
    index.html
    style.css
    script.js
    server.js
    package.json
    package-lock.json
    README.md
    netlify.toml
    .nojekyll
    .env.example
    AGENTS.md.txt
    data/
      obd-codes.json
      service-notes.json
      symptom-flows.json
```

削除候補を消す場合は、先に `deploy` で `npm start` して、`http://localhost:3000` の動作確認をしてからにしてください。

## オフライン更新の確認

- 3.13.332以降、画面のオフライン準備確認は1回の確認につきキャッシュを最大4件ずつ照合します。新しい確認や状態更新、確認対象ワーカーの変更後は古い確認の追加照合を止めます。読出し失敗時も追加照合を止め、開始済みの照合が終了してから未確認を表示します。開始済みのCacheStorage処理自体を中断するものではありません。診断データ・保存内容・ダウンロード処理は変更しません。

- 必要資材の取得・保存がすべて成功した版だけを有効化します。通信切断・HTTPエラー・保存容量不足では更新を拒否し、直前の版のキャッシュを削除しません。初回準備の失敗時は、まだオフライン利用できません。
- 更新一覧と各資材のダウンロードは、応答ヘッダー待ちから本文受信完了まで1件15秒で制限します。取得・保存に失敗した時点で未着手の取得は開始せず、既に開始した取得・保存処理が終了してから更新失敗として扱います。保存処理そのものを15秒で強制中断するものではなく、ブラウザ内のキャッシュ保存が停止した場合の終了時間は保証しません。通常利用時の診断JSON取得方法は変更しません。
- 更新一覧の版番号・件数・同一配信範囲を検証し、画面スクリプトの版番号も照合します。資材の同時取得は最大4件です。失敗時は今回新規作成した候補だけを除去し、次回は全件再取得します。以前から残っていた不完全キャッシュは、使用中のワーカーが別の版を所有すると確認できる場合だけ再取得します。所有が確認できない場合は、新しい版番号での配信が必要です。
- 「準備済み」は、有効化済みサービスワーカーが応答する実際の版番号と保存資材を確認した場合だけ表示します。URLの版番号だけでは判断せず、他の版や他アプリのキャッシュも合算しません。版の問合せは読取り専用で、資材取得や有効化を起こしません。
- 状態表示では、版の照合不可、当該版のキャッシュ未保存、資材一覧の欠落・読取不可・版または件数の不一致、保存データの読出し失敗を分けます。更新が不採用になった理由は画面だけでは確定できないため未確認と表示し、通信障害・容量不足・旧版の利用可否を断定しません。
- 診断JSONのオンライン更新は維持します。この制御は更新導入の完全性確認であり、全資料のハッシュ固定や実車通信の確認を意味しません。車両POST要求・no-store要求はキャッシュ対象外です。
- 配信する資材を変更した場合は、画面・サービスワーカー・オフライン一覧の版番号を揃えて更新してください。同じ版の有効化済みキャッシュへの再インストールは拒否します。
- 検証: `npm.cmd run validate:offline`。通信失敗、保存失敗、再試行、旧版保持、版別表示、オフライン応答を検証します。更新失敗で有効化しない扱いは[Service Worker仕様](https://www.w3.org/TR/service-workers/)に従います。

## 端末内の整備事例保存

- 読取拒否・破損JSON・不正な保存行は「事例なし」として扱いません。全タブ共通の警告を表示し、事例の変更とCSV/JSON出力を止めて元データを保持します。「保存事例を再読込」が成功すると通常の保存へ復帰します。診断計算・保存形式・正常データの正規化は変更していません。
- 起動時のテーマ・注意事項・セッション設定を読めなくても初期化を継続します。セッション設定が不明ならロック状態、テーマはライト、注意事項は未確認として扱います。詳細トークンを読み取れない状態を初回設定として扱うことはありません。端末内保存やオフライン資材の利用可否は別途確認が必要です。
- 全削除は従来どおり2回の確認が必要です。事例の削除に失敗した場合は一覧と読込エラー状態を維持し、事例削除後にテーマ等の削除が失敗した場合は一部失敗と表示します。
- 追加・削除・JSON取込み・ダミー事例作成は、端末内への書込みが成功してから一覧へ反映します。容量不足や保存拒否では既存一覧を維持し、失敗を通知します。登録フォームは成功時だけリセットします。
- JSONの保存形式、正規化、重複判定、CSV列、診断の原因候補順位は変更していません。取込み途中の失敗で一部だけを一覧へ追加しません。
- 「保存/検索/出力チェック」は一時キーで保存・再読込みを確認し、実際の整備事例の保存キーには書き込みません。一時データの削除失敗は成功と表示せず、別途通知します。
- 検証: `npm.cmd run validate:case-storage`。保存拒否・容量不足・再試行・再読込み・バッチ内重複・JSON往復・一時領域の後片付けを確認します。ブラウザのデータ消去や複数タブ間の同時編集まで保証するものではありません。重要な事例はJSONバックアップも保持してください。

## 読取セッションのJSON保存

- 貼付・手入力も解析前にUTF-8で2,000,000バイト以下か確認します。超過・サイズ確認失敗時は置換確認や解析へ進まず、現在の結果を保持します。手入力欄はそのまま残し、クリップボードやファイルからの取込では元の入力欄も保持します。空白もサイズに含め、切り詰めや部分解析はしません。内部の連続読取統合と診断規則は変更していません。
- 読取結果が更新・置換された場合、前の結果に対するJSON保存通知を消します。保存開始の表示を別の結果へ引き継ぎません。結果が変わらない取込キャンセル・取込拒否・入力クリアでは通知を維持します。保存完了の判定や自動保存は行いません。
- `.json` または `application/json` として選択したファイルは、置換確認・診断解析の前にJSON構文を確認します。破損・途中切れの場合はテキスト解析へ回さず、入力欄と現在の読取結果を保持します。これは構文確認であり、診断内容や対応形式の保証ではありません。通常テキスト・CSV・HTML・手動貼付の解析規則は変更していません。
- 「入力をクリア」は入力欄と保留中の取込をクリアします。保持中の読取結果がある場合は、DTC・ライブ値・取得状況・注意事項・件数をそのまま残し、JSON保存対象も変えません。読取結果がない場合や接続前プレビューは従来どおり表示をクリアします。車両DTC消去や保存データ削除の操作ではありません。
- 現在の読取結果がある場合、手動の「診断機データを解析」・クリップボード貼付・ファイル取込の置換前に確認します。キャンセル時は現在の結果を保持し、貼付・ファイル取込では入力欄も置き換えません。空画面・接続前プレビュー・内部の連続読取統合は確認対象外です。保存開始後も確認は省略せず、確認できない環境では置換しません。接続開始や読取プロファイル変更等の別操作を保護するものではありません。
- 空の手動入力や検証で拒否されたJSON/CSVは、保持中の読取結果表示を消しません。置換の承認は入力の検証成功を意味せず、診断値の解析・保存形式・適合判定は従来の処理を使います。
- 画面内に読取セッションがある間は、ページ更新・移動・タブ終了時にブラウザーの終了確認を要求します。空画面・接続前プレビューは対象外です。JSON保存開始後も実ファイルの保存完了は確認できないため、終了確認を維持します。読取中・保存失敗・容量超過でも解除しません。
- 終了確認は自動保存や復元機能ではありません。未解析の入力文、上書き済みの過去セッション、画面内の結果置換操作は保護対象外です。[ブラウザーの制約](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)により、事前の画面操作が必要で、スマホでの強制終了・クラッシュ等では表示されない場合があります。確認文言はブラウザーが決めます。
- DTC・ライブデータの「取得状況・注意事項」は初期表示では全文を開きます。手動で折り畳んだ後も、内容更新・エラー表示時には自動で開き直します。表示の開閉で診断値や保存内容は変わりません。
- 読取結果の上部には、現在の選択欄ではなく読取セッションに保持された車両・型式・年式・エンジン型式・車種適合を表示します。項目がなければ未記録とし、プロフィールの表示だけで適合確認済みとは扱いません。
- 「入力例（架空データ）」は独立したプレビューです。現在の入力・読取セッション・保存対象を置き換えず、プレビューからの適用・保存・診断開始・車両操作はありません。以前の版で保存した識別印のない入力例や、手動で貼り付けた架空データを自動判別するものではありません。
- 読取結果画面と診断データ取込欄の「読取結果をJSON保存」から、現在のセッションをファイルへ出力できます。既存の `bridge_session_export_v1` 形式を使用し、診断値・車両プロフィール・適合情報を保存します。内部状態すべてのバックアップではありません。
- ファイルは読取結果画面の「読取結果ファイルを開く」、または診断データ取込欄の「診断結果ファイル」から再取込できます。どちらも同じ取込処理と容量制限を使用します。プロフィールが復元されても、車種適合が確認済みになるわけではありません。
- 読取・取込の処理中、接続前プレビュー、明示的に拒否されたデータは保存しません。再取込上限の2,000,000バイトを超える場合も出力せず、元の結果を保持します。
- 既存の匿名化処理を通し、ファイル名は日時だけを使います。ブラウザへ保存を引き渡した時点で「保存を開始」と表示します。実際の保存先や保存完了はブラウザ側で確認してください。車両送信・外部アップロード・localStorageへの自動保存は行いません。
- 検証: `npm.cmd run validate:session-export`。出力と再取込、匿名化、元データ保持、失敗時の処理、プロフィールと適合情報の独立した復元を確認します。

## 通信試行記録の数値

- DTCの応答回数と応答待ち時間は、数値型の非負整数または数字だけの文字列を受け付けます。前後の空白と先頭のゼロは許容します。本ツールの取込上限は応答回数10,000回、待ち時間600,000msです。車両側の規格上限を示すものではありません。
- 真偽値、配列、オブジェクト、負数、小数、および文字列の `1.0`、`1e2`、`0x10`、`+1` は通信試行の根拠にしません。CSVも値全体を検証し、末尾の不正な文字を切り捨てて数値化しません。数値が不正でもDTC自体は保持します。
- 不正な数値を含む取得品質サマリーは、完了フラグが指定されていても通信試行の根拠が揃った扱いにしません。保存済みの正当な整数は維持します。旧版で不正値から既に整数へ変換された記録は、実測値と区別できないため推測で修正しません。
- 応答待ち時間は設定値であり、ECUの実測応答時間とは別の項目です。検証: `node scripts/validate-response-attempt-numbers.js`。

## CSVのDTC補足記録

- 検出時刻、発生距離、暖機回数など既存19項目は、CSVの値全体を検査してから取り込みます。前後の空白を除いた長さが数値・時刻では80文字、単位では24文字を超える場合も除外します。長い値を切り詰めて正常値として扱いません。
- 除外した値そのものは保持せず、項目・理由・行番号・ECUなどの既存検証情報を残します。空欄は不正値として数えません。補足記録が不正でもDTC自体は保持し、検証情報はJSON保存・再読込にも引き継ぎます。
- サンプル出力後の検査も同じ文字数制限を使います。検証: `node scripts/validate-dtc-evidence-input.js`。

## メーカーサンプルTSVの数値検証

- 補足19項目と応答回数・待ち時間は、出力元の値を文字列化・切り詰めする前に検査します。配列や真偽値を数値とみなさず、不正な値は `invalid_integer` など値を含まない理由マークに置き換えます。DTC行は保持し、出力検査は未完了になります。
- 正常な応答回数・待ち時間は整数表記へ統一します。空欄と明示的な0を区別し、不正な優先値を別名や集計値で補いません。TSV再取込では補足項目の除外理由を記録し、応答回数・待ち時間は未取得として扱います。
- 対象は今回出力する値の21項目です。過去に正規化・除外された値の復元や、除外履歴だけからTSVのマークを再生成する処理、JSON直接入力全体の型検証は含みません。既存の列構成と車両送信制限は変更しません。検証: `node scripts/validate-manufacturer-evidence-export.js`。

## 除外履歴がある読取結果の保存

- 補足値の除外履歴がある読取結果は「読取結果をJSON保存」で保持します。現在の実機サンプルTSV（45列）は、履歴の元行・ECU応答・サブコード・取得文脈を完全には保存できないため、その結果のTSV出力は開始しません。履歴のない結果と空テンプレートは従来どおり出力できます。
- TSVの両生成APIは `manufacturer_sample_tsv_invalid_evidence_history` を `code` に持つ例外で拒否します。空テンプレートや部分ファイルを代わりに出力しません。画面はJSON保存を案内し、元の読取結果を変更しません。無効件数や無効項目一覧だけが残った場合も保護し、一般的な確認待ち・証跡不足だけでは拒否しません。
- JSONの保存形式・容量制限・処理中の保存制限は変更しません。取込時に記録した除外履歴の保存を確認していますが、詳細履歴が欠けて件数だけが残る不完全な入力から元行を復元するものではありません。正常値を推測で補ったり、履歴を別のDTC行へ割り当てたりしません。検証: `node scripts/validate-manufacturer-history-export.js`。

## 保存JSONの読取品質要約

- 対応する保存JSON（`bridge_session_export_v1`）に無効な補足値の申告があり、既存の受信品質要約がない場合は、保存されていた読取品質要約を受信側の要約として引き継ぎます。件数・項目・理由は現在の取得結果と分離し、消えている詳細履歴を作りません。TSV保存の制限も継続します。
- 既存の受信要約がある場合は、その優先順位を維持します。異なる要約を加算・統合しません。そのため既存の受信要約と別の読取品質要約が競合する入力の両方を保存する保証は含みません。正常な要約や無関係な確認待ち、対応書式でないJSONには今回の引継ぎを適用しません。
- 詳細履歴がない場合、要約間の件数差は診断上の改善・解消を意味しません。比較は未確認のまま扱います。検証: `node scripts/validate-quality-history-roundtrip.js`。

## 注意

読取品質の表示では、現在の集計と「受信品質」を分けます。受信品質は診断フロー、詳細要約、取込結果の注意欄で確認でき、受信要約がない場合は項目を出しません。除外状態や対象項目だけがある場合は件数未記録とし、項目数から除外件数を推定しません。表示関数へ直接渡された不正型や空の要約を0件に変換しませんが、既に内部で正規化された数値の由来を復元するものではありません。診断判断・保存形式・車両送信制限は変更しません。検証: `node scripts/validate-quality-disclosure.js`。

これは整備書の代わりではありません。原因を断定せず、最終判断は実車確認とメーカー整備書を優先してください。

ブレーキ、エアバッグ、燃料、高電圧に関わる作業は安全上の危険があります。登録データや相談結果だけで作業を進めず、メーカー整備書と安全手順を確認してください。
