# Moonshine Voice 日本語音声入力 実験版

公開先: https://fun7772ei.github.io/bosai-ai/ （既存の同じページ・リポジトリ）

## 目的
iPad 第10世代 Safariで、Ruri-30Mの意味検索に追加するローカル日本語音声認識の実機適性を検証する。自由生成LLM・会話制御エンジン・音声読み上げは追加しない。

## 実装
- 既存の質問フォームの中に、任意起動の「音声入力を試す」を追加。既存の軽量検索・Ruri検索と互換。
- 公式 `@moonshine-ai/moonshine-wasm@0.1.5` の `MicTranscriber` を **明示タップ時のみ** pinned jsDelivr ESMから動的読み込み。自動ロードしない。
- 日本語 `ja`、`ModelArch.Tiny`（通常版・非Streaming）を互換版として使用。現行のピン留めSDKでは `MicTranscriber.options()` が存在しないため、日本語向けの `max_tokens_per_second` は未設定。音声の反復・欠落を実機で確認する。
- 明示的な「音声AIを準備」と「マイク開始」を分離し、Safariのユーザー操作に紐づくマイク開始を維持。
- 認識途中テキストは参考表示のみ。確定した `onLine` のテキストだけ入力欄へ反映。自動送信しない。
- 停止時に音声モデル・マイクを解放。通常の検索に戻る場合も音声モデルを解放。Ruriの保存データはそのまま。
- エラー時には既存のテキスト入力・軽量検索へ復帰可能。

## 現時点の重要な限界
- Moonshineの日本語Tiny Streamingは34Mパラメータ、公開評価ではCER 19.7%。危険な言い間違い・否定の反転に注意し、利用者が全文確認してから検索する。
- WASMライブラリは外部CDNのESMを参照している。モデル自体はMoonshineのCache Storageに保存されるが、**CDNのJS/WASM資産を含めた完全オフライン再起動は未証明**。この実験版を「音声のオフライン対応完成」と表示しない。
- iPad Safariのマイク・WASMの実動作、メモリ、文字認識精度、長時間利用は未検証。
- 既存Ruriモデル比較の研究と並行して実施し、Ruriの上位モデルを無断で初期モデルに切り替えない。
- 音声データはこのアプリから外部AI APIに送らない。Moonshineの公式WASMを端末内で実行する。モデル/JSは初回ネットワークから取得する。

## iPadの最小テスト
1. 既存Pagesで軽量検索・Ruri検索が従来通りできることを確認。
2. 「音声AIを準備」→モデル取得・初期化。マイク許可とは分離されている。
3. 「マイク開始」→「地震のときどうすればいい？」と言う→「録音停止」。入力欄にテキストが反映されるか確認。
4. 「津波が来たらどこへ逃げる？」、「断水でトイレが使えません」も試す。
5. 「津波は来ない」「避難しない」など否定のある入力で誤認識を記録し、必ず手動で修正してから検索。
6. ボタン停止、マイク解放、再準備、既存Ruri検索へ復帰、再読み込み後の保存状態を確認。
7. 音声認識のオフライン再起動・ホーム画面PWAは**別途実測するまでは未対応扱い**。
8. 失敗時にはSafariバージョン、段階、エラーの画面を記録。既存のIndexedDBやサイトデータは削除しない。

## 追加検証の次の段階
iPadでMoonshineが安定してから、CDN依存のWASMを同一originに梱包してService Worker precacheに含め、音声モデルCache Storageのオフライン再起動・更新・容量を別途確認する。その後に会話制御エンジンへ認識テキストを渡す。

## 2026-10-14 Safari初回実機：Moonshineモデル準備画面で2分以上停止
原因は現時点では特定していない。SDK `@moonshine-ai/moonshine-wasm@0.1.5` の既定配布版が pthreads と `SharedArrayBuffer` を使い、`crossOriginIsolated=true` を必要とすることを公式ドキュメントで確認。標準GitHub PagesはCOOP/COEPを付けないため、そのままでは起動できない可能性が高い。

同じPages上で `?voice_iso=1` のナビゲーションだけService WorkerがHTMLレスポンスへCOOP/COEPを付ける研究用切替を用意。通常のRuriタブには分離ヘッダーを適用しない。新SWが待機中なら旧タブを閉じて再起動する必要がある。ブラウザがこの方式で `crossOriginIsolated` を許可するか、外部CDN/モデルがCOEP経由で読み込めるかは別途実ブラウザ検証必須。対応が確認できない場合は単一スレッドWASMのビルドを検討する。

「音声AIを準備」を押すと、分離されていない場合はダウンロードを開始せず理由と切替ボタンを表示する。保存済みRuriやその他のサイトデータは消さない。

## 同一originへのSDK配信
Safari WebKitのCOEP下でCDNを動的importするWorkerが動かない場合に備え、Moonshine公式npmパッケージv0.1.5の `dist/` 全ファイルをビルド時に取得し、`/bosai-ai/moonshine/` へ同一origin配信する。SDKのモデル重みは同梱しない。Ruriのオフラインshellキャッシュには月光SDKの大型WASMを入れず、音声機能の初回操作まで転送しない。初回ダウンロードではネットワークが必要。

## 2026-10-14 Safari実機：音声入力エラー「12121416」
使用者からモデル準備中に8桁の数値のみのエラー報告。公式 `errors.ts` によれば、embind上のC++例外がWASMメモリ上のポインター（JS number）として投げられる場合があり、数値を通常のエラーコードと見なさない。直接原因は未確定。準備ステージ表示と `getExceptionMessage` のネイティブ例外復号を加える。
またCIで、従来のSDK importに加え、実WASMの初期化と日本語Tiny Streamingの配布マニフェスト生成を検査する。モデル全ファイルのダウンロード・推論、iPad Safariでの成功を意味しない。

### PR #15レビューP2対応
単独の `loadMoonshineModule()` による事前WASM起動を廃止。SDK管理の `mic.load()` だけがWASMを保有する。モデル進捗イベントの有無で「WASM・配布情報」/「モデル取得・読み込み」を分ける。ネイティブ数値例外は別のWASMインスタンスに属する可能性があるため、誤ったheapでデコードせず「内部例外、数字はエラーコードではない」と説明・記録する。

## 2026-10-14 原因確定（配布WASM側のモデル対応表）
Linux Chromium上でv0.1.5の実WASMを起動し、日本語モデルのマニフェストを列挙。提供WASMは `ja` に対してモデルarch 0（Tiny通常）とarch 1（Base通常）のみ有効。arch 2（Tiny Streaming）と4（Small Streaming）は `moonshine:-3:Invalid argument` を返す。したがって旧指定の `ModelArch.TinyStreaming` は現在の同梱WASMとは非互換であり、以前の数値例外（WASM内C++例外ポインタ）に一致する。
今回、利用可能な `ModelArch.Tiny` に変更する。**これは当初の34M Tiny Streamingとは異なるモデル**。対応モデルの実際の日本語認識速度・精度、ストリーミング時の挙動、iPad Safari上の完全初期化は再検証する必要がある。現在のPagesでの実動作が確定するまでは音声は実験扱い。
