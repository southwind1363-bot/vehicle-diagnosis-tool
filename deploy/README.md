# 自動車整備 診断補助ツール

登録済みJSONデータ、問診、整備事例を使って、確認順序を整理する診断補助ツールです。

## 現在の完成版

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

OBD2車両読取タブは、将来のUSBシリアル接続によるDTC、フリーズフレーム、リアルタイムデータ表示専用です。現段階では通常利用者には車両接続を開放せず、開発者ゲート内だけで読取テストを進めます。外部診断機の読取結果を貼り付ける機能は診断補助へ統合し、現在は外部診断機の結果から診断を開始し、将来は車両読取結果を問診、診断手順、ライブデータ解析へ直接引き継ぐ構成にしています。データモニター辞書は `data/obd-monitor-definitions.json` で管理し、エンジン、燃料、吸排気、排出ガス、過給、ディーゼル後処理、トルク、変速機、ハイブリッド、状態情報など152項目を登録しています。主要診断ワークフローには推奨モニターID、観察条件、解析上の注意を関連付け、車両が対応して返した項目だけを表示対象にし、未取得値や正常範囲は推測補完しません。外部診断機ログでは、電源電圧、燃料補正、温度差、停止/運転状態などの相関ヒントを表示し、正常/異常の断定ではなく次の確認条件へつなぎます。車両接続、DTC読取、フリーズフレーム取得、リアルタイムデータモニター、DTC消去は機能単位で準備します。Web Serial接続プロファイル、通信速度候補、停止条件、保存DTC読取、保留DTC読取、フリーズフレーム取得、対応PID確認、主要ライブデータ取得、DTC消去要求の通信準備を定義しています。高度な通信はWeb Serial、ローカル通信ブリッジ、J2534 Pass-Thru、UDS/CAN/CAN FD、DoIP、専用VCI SDKの順に分け、ブラウザUIと車両通信層を直接結合しない構成で進めます。ローカル通信ブリッジはAPI契約、候補ポート、読取Intent、遮断する変更系Intent、ペアリング条件、ログ方針、ステータス/VCI一覧/DTC/ライブPID/セッション概要の応答型を定義し、PC側の読取専用サンプルブリッジ `local-bridge-readonly.js` でWeb側との疎通を確認できます。実車へ送信する操作は内部ガードで無効化し、変更系要求は失敗時安全停止で拒否します。公開UIでは通常利用者に不安を与えないよう接続機能の準備状況として表示し、詳細な保護条件は技術メモへ折りたたみます。DTC消去、作動要求、セキュリティアクセス、書込み系サービスは、車種適合、実行条件、利用者確認、記録、失敗時の復旧、安全警告を機能ごとに確立してから段階的に有効化します。

### 開発用ローカルブリッジ

PC側サンプルブリッジを起動する場合は、ブラウザ側の開発トークンと同じ値を環境変数へ設定します。

```powershell
$env:LOCAL_BRIDGE_PAIRING_TOKEN="任意の12文字以上のトークン"
$env:LOCAL_BRIDGE_PORT="8765"
npm.cmd run bridge:dev
```

CANable/SavvyCAN/candumpなどで保存したログを再生する場合は、起動前にログファイルを指定します。

```powershell
$env:LOCAL_BRIDGE_REPLAY_LOG="C:\path\to\obd-can-log.txt"
npm.cmd run bridge:dev
```

Web側では同じ値を一度だけ設定します。

```js
localStorage.setItem("vehicle-diagnosis-obd-dev-token-v1", "任意の12文字以上のトークン")
```

このブリッジは読取専用サンプルです。`bridge_status`、`list_vci`、`read_stored_dtc`、`read_freeze_frame`、`read_live_pid_snapshot` などの読取応答を返し、DTC消去、作動要求、書込み、セキュリティアクセスは拒否します。ログ再生では `7E8#04410C1AF8`、`7E8 [4] 41 0C 1A F8`、SavvyCAN系CSVのような保存ログをDTC/フリーズフレーム/ライブPID/Mode01 PID01のMIL・DTC数・レディネス生ステータス応答へ変換します。標準PIDは燃料補正、燃圧、点火時期、吸気温、O2センサー、空燃比センサー電圧/電流、EGR、EVAP、始動後時間、消去後距離、燃料残量、大気圧、当量比、外気温、燃料消費率などの基本データモニター値を順次デコードします。

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
```

JSON構文、文字崩れ、DTC形式、ID重複、整備書確認フラグ、出典URLの型、車両候補の文字列配列、年式範囲の重複を検査します。

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
  --source "SAE J2012DA_202510 licensed dataset" `
  --source-url "https://saemobilus.sae.org/standards/supplements" `
  --source-date "2025-10-24"
```

検査結果を確認した後だけ、同じコマンドへ `--write` を追加します。出力先は `data/imported-verified-dtc.json` です。

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

## 注意

これは整備書の代わりではありません。原因を断定せず、最終判断は実車確認とメーカー整備書を優先してください。

ブレーキ、エアバッグ、燃料、高電圧に関わる作業は安全上の危険があります。登録データや相談結果だけで作業を進めず、メーカー整備書と安全手順を確認してください。
