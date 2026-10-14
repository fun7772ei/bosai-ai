> **現行：PR #18の継続改善（Phase 2 α）、固定0f3e5e2、133単体。** [最新の実装・比較・失敗・再現・iPad判断](docs/phase2-conversation-improvement.md)を先に読む。P1/P2と再レビュー追加指摘を修正し、複数ラウンドで固定後の未使用会話を実Ruriで評価。旧セットは回帰へ移行し、成績/失敗を保持。極性/対象/質問の扱いは改善したが、原文の適用・否定した場面の記事・発生日の未収録等は未解決。安全性完成ではない。main6ae5471と既存公開版を維持し、**マージ/Pages公開/新規PR作成はしない**。Ruri30 q8/既存保存/原文88件/通常検索/SW/DBを維持。Moonshineは既存Tiny通常版、Issue #16は今回未修正。iPad実機未操作。

---

以下はPR #18初版以前の履歴で、現在の方針/評価と混同しない。

> **現在の作業：Phase 2 α（文字会話試作）。** Issue [#17](https://github.com/fun7772ei/bosai-ai/issues/17)全文と最新main `6ae5471` を基準に開始。新規PRまで。**mainマージ・Pages更新は禁止（今回未実施）。** [実装・評価・失敗・次の手順](docs/phase2-conversation-alpha.md)を先に読む。PR #14はOPEN・ガード未採用。MoonshineはPR #12/#13/#15で日本語Tiny通常版まで実装済み、ユーザーの基本認識成功報告あり、Issue #16の反映停止/誤認識は未解決・今回未修正。自由生成なし、30M/88原文/既存保存と音声導線を維持。以下は過去の経緯であり、「今回公開する」「音声未着手」「iPad基本動作未確認」等を現在の方針と混同しない。

> 公開済み（2026-10-14 UTC）：https://fun7772ei.github.io/bosai-ai/ 、ベータ版 `f41848b50937`。PR #10を7c413abで一括通常merge、公開CI/Pages/実HF保存・SHA256/Chromiumオフライン再起動が成功。[公開結果](docs/ruri-beta.md#公開結果2026-10-14-utc)・[証跡](docs/diagnostics/beta-release.json)。#7〜#9は統合済み重複のためclosed、元ブランチは保持。iPad Safari実機は未確認。以下の「PR予定」は実装時の経緯。

# Ruri優先・公開ベータへの引き継ぎ（2026-10-14 UTC）

公開用 `codex/ruri-public-beta` はPR #6〜#9を継承し、mainをbaseとしたPR #10で一括統合済み。公開証跡の追記は `codex/ruri-beta-release-record`。今回のユーザー依頼は、公開用変更のレビュー可能化・必要な検証の成功を条件にmain反映とGitHub Pages公開までを含む。以下の過去の「マージ・公開しない」は当時の依頼の履歴であり、今回の公開方針ではない。

最初に [公開ベータの結果・失敗・再現手順](docs/ruri-beta.md) と [実測集計](docs/diagnostics/beta-summary.json) を読む。公開実施状況・Actions・URLは同資料末尾へ記録する。**iPad Safari実機は未確認。正式完成・安全性確認済みとは扱わない。**

- 公開は軽量＋Ruri-v3-30m q8 CPU/WASMが既定。Ruri単独/軽量も選べる。Ruri未保存・失敗は軽量へ戻る。モデル約43.8MBを明示保存し、保存済みのみで推論する。質問を外部AI APIへ送らない。
- 公開ビルドからLFM/GGUF/生成Workerを除外。原文の候補を利用者が選び、概要・全手順・注意・出典を表示する。候補を自動的に答えとして開かない。リアルタイム情報や個別診療を提供できない。未収録/曖昧判定は完全ではない。
- 旧Phase 1/LFM研究コードは `research.html`、`npm run dev:research` / `npm run build:research` に保持。`research-dist/` はPagesへ出さない。既存モデル選択・設定・IndexedDB/Cache APIは変更・削除しない。ベータのモード設定は別キー。
- 読み込み中停止はWorker終了＋世代管理で後続処理を中断。研究用LFMの冷間初期化中も停止できる。併用の単一候補/全同点の正規化ゼロを修正。リセットは実行モデルを解放し、保存モデルは残す。
- PR #9の64問は回帰用。87cf7c3で検索9ファイルを凍結後、新規80問を作成。PR #10のレビューで、曖昧時の候補非表示・現在警報の案内・条件選択ループを修正しd7be140で再凍結、その後に別の60問を作成。80問は以後回帰用。最終正解を見た検索調整を行わない。精度と棄却を区別する。最終36正解ありでは併用Top-1 31/36、Top-3 35/36、Top-5 36/36。未収録16問の明示棄却9件、7件に関連候補が残る。曖昧8問の明示確認5件。危険8問のTop-1不一致は併用1、Ruri単独1で、単独は履物を危険な代用候補として提示。安全判断用途へ使わない。防災専門家の独立評価ではない。
- 実Ruriで最終60問×3方式＋回帰80問×3方式＋旧64問×3方式、保存失敗/再試行/再利用・停止・解放・旧保存共存・SW更新待ち・Chromiumオフラインのブラウザ終了再起動を検証済み。ダミーGGUF保存センチネルの保持は実GGUF推論成功を意味しない。研究の冷間停止は別に実GGUFを使用。
- 原文88件は元固定blobと全フィールド・順序が一致。元 `fun7772ei/bosai-app` は変更しない。アプリ・データ・事前計算ベクトル・ORTはSWへ同梱。重みはGit/Pages成果物へ含めない。モデル保存DBのversionは変えない。
- 最小iPad確認は同資料を参照。全モデル取得・アプリ消去・サイトデータ消去は不要。通常タブとホーム画面PWAの保存/オフラインを分けて記録する。Chromium全プロセスPSSをiPadの必要メモリとしない。

---

以下はPR #9以前の履歴。最新の公開方針と矛盾する箇所は上記を優先する。

# bosai-ai: Codex Cloudへの引き継ぎ

[PR #9](https://github.com/fun7772ei/bosai-ai/pull/9) はPR #8をbaseとするOPENの積み上げPR。マージ・Pages公開は未実施。

更新日: 2026-10-14（日本時間）。作業の対象は**Phase 1の安定化と検索プロトタイプの比較実験**。

## 2026-10-14 6方式の比較実証（最新作業）

今回のブランチは `codex/phase1-six-methods`、baseはOPENのPR #8 `codex/phase1-natural-language-search`（d5f78b5）。既存PRをマージせず、新規積み上げPRを作成する。Pages公開・正式Phase 2移行は行わない。[6方式の実測結果](docs/phase1-six-methods.md) を先に読む。以下の旧検索・モデル比較の節は履歴である。

- A/Dは既存軽量検索、B/Eは実Ruri-v3-30m q8 CPU/WASM、C/Fは両者のスコア統合。A-Cは原文、D-FはLFM350による根拠付き短文と原文。旧Phase 1画面とPR #8検索画面も維持。
- 88件の原データ・元リポジトリは変更しない。88×256の文書ベクトルを実モデルで事前計算し同梱（約258KB）。モデル本体はGit対象外。Ruri約43.8MBは初回明示保存、推論は保存済みファイルだけを利用。
- E/FはEmbeddingを実解放・Worker終了後にLFMを初期化する。両常駐はlocalhostの開発測定だけ。JS heap診断はWASM/モデル/OSメモリを含まない。Linuxのプロセス全体PSS回収も測定するが、Safariの値ではない。
- 公式TokenizerでBOS込み入力＋64生成が512以内か検査。概要・全手順・注意を切り捨てず、超過や打ち切りは原文へ戻す。通常生成の200文字/32・64 tokensを変えない。既存GGUF URLと保存を再利用し、選択・保存DBを消さない。
- 開発40問だけで比較条件を決め、コミットf9a7ca5で凍結。その後、未使用64問を作成。最終正解を見た閾値・プロンプト・アルゴリズム調整は禁止。freezeのSHAと最終問題の来歴をdocs/diagnosticsへ保存する。
- 最終検索Top-1はA39/56、B49/56、C52/56。未収録の誤提示は6/8、6/8、7/8で残課題。Oracle正解根拠でもLFMが危険な否定逆転を生成する。流暢さ・構造上の完了を安全な正答と同一視しない。
- 検証版は精度評価a4552b88bde8、最終UI fcb0a25359b4。単体64件・本番ビルド・保存互換・実モデルA-Fオフライン/停止/リセットが成功。実GGUF242生成と実質問Embedding256件を記録。
- 実出力・意味採点・速度・メモリ・各実行結果は上記資料とsix-*.jsonを参照。採点は独立した防災専門家評価ではない。iPad Safari実機・長期安定性・実機PWAオフラインは未確認で、Phase 1成立とは扱わない。
- 次のiPad試験はレビュー後にAとRuriのC/Bへ絞る。全モデル取得、保存消去、PWA再インストール、64問反復を要求しない。

## 2026-10-14 検索プロトタイプ（今回の最新作業）

今回のユーザー依頼は、Phase 1の継続として **88件の固定コピー・自然言語検索の実装・実GGUF比較・積み上げPRまで**。従来の「Phase 1では辞書を移植しない」は今回の実験範囲に限り更新する。正式なPhase 2統合・RAG・会話履歴には進めない。PR #6/#7を勝手にマージせず、今回もマージ・Pages公開を行わない。

- ブランチ `codex/phase1-natural-language-search` はPR #7の `codex/phase1-cpu-model-comparison`（f28547d）を継承。PR #7がOPENなのでbaseもそのブランチ。
- `fun7772ei/bosai-app` は一切変更せず、固定commitの `data.js` をコピー。88件の全フィールド、ID、順序、カテゴリを元アプリと照合し、来歴/原ファイルを `docs/source/` に保持。アプリは同梱JSONだけを使い、GitHubへの動的同期はない。
- 原文表示の検索実験画面を追加。モデル不要の軽量検索が既定。従来AND検索、同じ軽量候補3件をLFM350/700 CPUで選別する方式を比較。LLMの自由文を防災情報として表示しない。不正出力・停止・リセット等は軽量結果を保持。
- [検索比較結果・再現手順・制約](docs/phase1-search-prototype.md) を先に読む。40問は開発用セットで独立評価ではない。Top-3は少なくとも1正解を含む率で、全関連情報の網羅ではない。実生成の成功と検索正解を区別する。
- 既存モデル・選択・保存DB/旧Cache API・停止・リセットを維持。セッション二重読み込みはしない。文脈512、CPU1スレッドを変えず、通常生成32/64と検索選別8 tokensを分離。
- データと検索JSはPWA shell保存対象。Chromiumのネットワーク遮断再読込の確認と、iPad Safari/PWA実機確認を区別する。ユーザーにPWA再インストール・保存消去・全モデル取得・40問の反復を求めない。
- build `0ab87a57417d`、40問（正解あり35/該当なし5）。Top-1は軽量30/35、LFM350選別14/35、LFM700選別21/35。実生成33件ずつ、LLM中央値6.09秒/13.53秒、全体PSSピーク1,468/2,048 MiB（Linux Chromium値）。LLMは既定採用せず、700MをiPadへ新規取得させる根拠も今回は得られなかった。
- npm ci、54単体テスト、ビルド、ダミー保存互換、モデル不要の画面、両モデルの実GGUF・停止/リセット・Chromiumオフライン再読込が成功。`--with-deps` はroot認証不足で失敗し、既存Chromiumを使用。
- 最終精度・待ち時間・メモリ・実行検証は上記資料と `docs/diagnostics/search-*.json` に記録。今回の版のiPad実機、長時間安定性、実災害での安全性は未確認。正式統合は精度/速度/実機結果で判断する。

## 2026-10-14 4モデルCPU比較（PR #7の履歴）

PR #6はOPENのまま。`codex/phase1-cpu-model-comparison` は `codex/phase1-cpu-quality`（5e94403）を継承し、PRのbaseもそのブランチとする。PR #6や今回のPRを勝手にマージせず、Pagesも公開しない。比較版build `b49b4010ddff`。詳細は [4モデル比較](docs/phase1-four-cpu-models.md)。

- 全4モデルがwllama/compat 3.8.1 / b11364-46ca246で実生成に成功。ランタイム変更不要。Qwen3.5日本語v2/Qwen3のJinjaとthinking無効をloadと各requestに明示。
- LFM350、Qwen3.5日本語v2、Qwen3、LFM700の順で、既存12問の厳密合格4/5/5/6、追加防災文4問は3/1/0/3。同条件16問×32/64上限と推奨32上限の192生成を記録。Qwen3.5のpresence penalty対照16生成と32/64実生成も追加。全出力はdocs/diagnosticsへ保存。
- 追加3候補をアプリで手動比較できる。既定はLFM350を維持し、既存モデル/形式選択・保存を上書きしない。アプリ更新でモデルを削除しない。候補追加は製品採用ではなく、全候補のiPad取得も求めない。
- 最小リスクの基準はLFM350。品質優先で新たに1つ試すならLFM700だが、待ち時間・メモリが増え、不自然な日本語と誤読が残る。Qwen3.5は形式違反や分類誤り、Qwen3は反復/誤抽出があり、いずれも防災回答の品質は未達。
- 全モデルで本番previewの保存・読み込み・生成・停止・リセット・オフライン再読込をChromiumで確認。Safari/PWAの実機結果ではない。ユーザーのオフライン/PWA実機確認は後回しという希望を維持。
- 初期のメモリ親プロセスのみの値は除外し、PPidで全子を列挙して再測定。比較ハーネスと本番アプリのBlob/保存経路でメモリが違う。Safari値として外挿しない。
- 非永続の一時プロファイルでQwen3.5の保存中にQuotaExceededError。通常のworkspace永続プロファイルで再試験して成功（quota上書きなし）。空の容量例外を汎用Worker失敗と表示しない診断修正を追加。Safariの失敗原因と同一視しない。
- Node24でnpm ci、48テスト、ビルド、ダミー保存・更新互換、4モデルの実GGUF回帰が成功。モデル本体はGit/Pagesに入れず、外部AI APIへ質問を送らない。Phase 2へ進まない。

## 2026-10-14 CPU回答品質比較と整合性修正（PR #6の履歴）

ユーザー依頼はPhase 1の回答品質調査・実装・比較・PR作成まで。今回はマージ/Pages公開しない。詳細は [品質比較結果](docs/phase1-cpu-quality.md)。

- 固定GGUFの公式テンプレート、Jinja、system指示、サンプリング、32/64上限を実GGUFの18条件・108生成で比較。汎化と速度を両立する改善が見つからず、system/生成設定は変更しない。LFMモデル・文脈・スレッド・入力/出力制限は維持。
- 新規ユーザーの初期モデルを `lfm2-cpu` へ変更。明示的な既存モデル選択、旧Qwen量子化設定、保存済みモデルは維持。`CLOUD_PROMPT.md` のQwen第一候補という古い指示を整理。
- ネイティブの終了理由をJSONへ記録し、出力上限で終わった場合は画面に途中回答の可能性を表示。停止・リセット・保存方式は維持。
- 前回の公開版 `64ece2a7b9b6` について、ユーザー提供Safariログは異なる入力7件完了、その後の別試行で5件完了とリセット後の再初期化（2.743秒）・生成成功を示す。全件 `stopped:false` で、途中停止は未確認。UAだけで機種は判別できず、開発側のiPad直接検証ではない。
- 今回の修正のiPad動作、長時間安定性、ピークメモリ、PWAオフラインは未確認。オフライン/PWA実機確認はユーザー判断で後回しとし、アプリやサイトデータの消去を求めない。
- LFM CPUは安定性比較の基準として残すが、防災の自由回答を任せる品質には未達。次のQwen3-0.6B GGUF CPU比較は価値があるが、今回はモデル追加せず、Phase 2にも進めない。

## 2026-10-14 CPU/WASM比較の追加（履歴）

LFMの同一入力10回成功後、ユーザーから「入力を変えると3件目前後で落ちる」「生成内容も微妙」と追加報告。前の仮採用は安定性成立を意味しない。必須対象は **iPad第10世代・iPadOS 26.5・Safari・PWAでのオフライン利用**。ユーザーの承認で、WebGPUとは別に **LFM2.5-350M GGUF Q4_K_M + wllama CPU/WASM** をPhase 1比較へ追加した。既存のQwen/LFM/Gemmaの保存と設定は維持し、自動置換・削除しない。

- CPUはWebGPU不要、1スレッド、Asyncify/MEMORY32互換ランタイム、文脈512、batch/ubatch64、入力200文字以下、出力32/64トークン、履歴・プロンプトキャッシュなし。SharedArrayBufferやCOOP/COEPヘッダーを要する複数スレッドを使わず、GitHub Pagesで比較できる構成。
- 新しいGGUFは229,312,224 bytes、固定revisionで別途明示取得。4MiB分割の既存DBへ保存し、読込時は分割ごとのBlobを組み合わせる。WASMへのコピーやネイティブ重み・KV等のメモリは必要で、iPadのピークメモリ改善は未計測。
- CPUランタイムもアプリのService Worker保存対象。CDNや外部AI APIへ質問を送らない。停止後の再生成、子Workerを終了してからリセットする処理を追加。保存DBのversionは変更しない。
- 測定・公開対象のアプリ版は `64ece2a7b9b6`。詳しい結果・制約・再現コマンドは [CPU比較結果](docs/phase1-cpu-results.md)。**開発側iPad検証は未実施。Phase 1は実機安定性・PWA再起動後オフライン・回答品質について未成立。Phase 2へ進めない。**

## ユーザー実機ログでLFMを第一候補へ（2026-10-14 日本時間）

アプリ版 `7912da5965d7` の提供JSONで、LFM2.5-350M / q4f16の初期化1回（2.879秒）と短文生成10回完了を確認。各36 tokens、速度20.86〜25.86 tokens/sec（平均23.60）、初回token245〜382ms。同じ入力・同じ出力で約18秒の試行であり、長時間安定性・回答品質・再起動後オフラインの証明ではない。

Gemmaはユーザーから10回連続テスト中のクラッシュ報告。提供JSONは復帰後で、前回の未完了段階が日本語生成、保存は6/6で残っている。何回目に落ちたか・メモリ/GPU等の原因は不明。Qwenは初期化時クラッシュ報告。**LFMを第一候補として仮採用し、Phase 2にはまだ進まない。** 詳細は [ユーザー実機結果](docs/phase1-user-results.md)。

今回のアプリ版は `7ca23c3c9e36`、ブランチ `codex/phase1-prefer-lfm`。新規利用時のみLFMを初期選択とし、既存の明示選択、旧Qwen設定、全モデルの保存は維持。モデル別の実機報告を画面へ反映。開発側がiPadを直接操作した検証として扱わない。

## Phase 1の比較モデル追加（2026-10-14 日本時間）

ユーザーの指定により、LFM2.5-350MとGemma 3-270M-itを比較モデルへ追加。Qwen3へのこだわりはないと明示され、両候補の追加とPages公開まで依頼された。**Phase 2の辞書統合はまだ実装しない。** 詳細と実機の比較手順は [モデル比較](docs/phase1-model-comparison.md)。

- 作業ブランチ: `codex/phase1-model-comparison`。アプリ版: `7912da5965d7`。旧Qwen3の保存・選択形式は維持し、初期選択を勝手に新モデルへ切り替えない。
- 固定revisionは `src/config.js` のcatalog。LFM/Gemmaは `.onnx_data` を含む6ファイルが必要。旧Qwenは従来の5ファイル。Hugging Faceのmain metadataも各モデルの固定revisionへ正規化。
- モデル選択と量子化形式をモデル別に保存。処理中／モデル準備後は選択をロックし、比較前にWorkerをリセット。削除ボタンは選択モデルの両4bit形式だけを削除し、ほかのモデル・共有保存領域を消さない。
- 診断JSON・ログ・生成測定・未完了checkpointにモデルID、revision、形式を記録する。JSONに全catalogも含める。初回比較の生成上限は64トークン。
- Node.jsの32テスト・本番ビルド・本番previewでのChromium検証は成功。ダミー外部重みで保存、形式とモデル復元、オフライン再利用、Qwen保持、選択モデル削除、診断の帰属を確認。
- 実際の固定revisionのTokenizerで日本語のsystem＋user入力と生成開始テンプレートを確認（LFM 49 tokens、Gemma 40 tokens）。**Tokenizer検証は回答生成や実モデル初期化の成功ではない。** 重み本体はGitに追加しない。
- `node scripts/inference-check.mjs lfm2 q4f16` / `gemma3 q4f16` はどちらもGPU機能不足で `not-run` / exit 2。このCloudのWebGPUはshader-f16非対応。iPadでの両候補の保存・初期化・日本語生成・再起動後オフライン生成は未確認。
- Qwen3について、公開後のユーザー写真でWorker起動・WebGPU確認・重み読込doneまで進み、その後Safari終了／再読み込みの報告がある。モデル準備完了・Tokenizer読込・生成成功は確認できない。Safari側の終了原因は未確定。小型候補を追加しても、推論初期化時の全重み・ORT・GPUメモリ需要は残る。

## Cloud継続作業の更新（2026-10-14 日本時間）

作業ブランチ: `codex/phase1-worker-storage-stability`。今回の詳細は [Cloudレビュー結果](docs/phase1-cloud-review.md)。**最新修正もiPad実機・実モデル推論は未確認。Phase 1の成立とは扱わない。** 以下の古い検証結果と今回の結果を区別する。

- 新しい提供ログは [safari-worker-failure.json](docs/diagnostics/safari-worker-failure.json)。ダウンロード開始直後のWorkerエラーに詳細がなく、成功記録なし。保存状態のログ形式は分割保存前のコードと一致し、現在の公開資産の形式とは異なる。旧画面・旧資産の可能性はあるが、Safariの原因を断定しない。ログ末尾には明示的なモデルキャッシュ削除がある。
- 小さなbootstrap Workerから取得／推論モジュールを動的に読み、起動完了後に処理を送る。モジュール読込・作成・実行・メッセージ・起動無応答を診断し、空のErrorEventにも説明を付ける。アプリ版を画面とJSONへ追加。
- IndexedDBのDB名・versionは維持。旧 `[url, index]` を読み、新規保存は `[url, generation, index]`。完成情報と全分割キーを照合し、取得サイズ・読込時の分割サイズを確認。再保存中は旧完成ファイルを保持し、最終transactionで切り替える。途中データは次の明示的な取得時に整理する。Rangeによる途中再開と暗号学的な内容検証は未実装。
- 書込はWeb Locksでタブ／Worker間を直列化する。APIがない環境の代替は同一JS実行領域のみで、複数タブの保証はない。旧Cache APIの正常ファイルの再利用は維持。
- Service Workerの即時切替を廃止。使用中の旧画面のWorker資産を保ち、旧タブを閉じた後に更新する。モデル保存の削除処理は追加しない。
- Node.js 24.19.0で現行10テスト・ビルド・ブラウザ検証を再実行後、回帰テストを追加。Cloud側の実測・失敗は上記レビュー資料に記録する。
- Qwen3と量子化の第一候補は変更しない。4MiB保存でもTransformers.jsは重み全体をUint8Arrayに読み、ORT/WASM/WebGPUの追加メモリが必要。実機の保存・初期化・短い生成・再起動後オフライン生成が判断材料。

## まず読むもの

1. [仕様書v1.1](docs/specification-v1.1.md)
2. 本ファイル
3. [現在の実装](README.md)
4. [検証結果と改修履歴](docs/phase1-results.md)
5. [ユーザー提供のSafari診断ログ](docs/diagnostics/ipad-cache-failure.json)
6. [iPad実機の検証手順](docs/ipad-verification.md)

[CLOUD_PROMPT.md](CLOUD_PROMPT.md) がCloudの新しいチャットへ貼る依頼文。

## 対象と制約

- 開発リポジトリ: https://github.com/fun7772ei/bosai-ai
- 公開テストページ: https://fun7772ei.github.io/bosai-ai/
- 引き継ぎ直前の実装コミット: `19bd080b839fb83437bc237ba0ffce35335a29a8`。引き継ぎファイル自体は後続コミットに追加するため、開始時は最新mainと差分を確認する。
- **iPad第10世代・iPadOS 26.5のSafariを最優先**。
- 現時点のCPU比較基準はLFM2.5-350M GGUF Q4_K_M + wllama/compat。旧Transformers.js/WebGPU候補も互換性のため維持。詳細は最新節を優先する。
- 外部AI APIを使わず、質問を外部へ送信しない。AIモデルをGitにコミットしない。初回オンラインで取得し、端末に保存する。
- GitHub Pagesで公開できる構成と完全オフライン動作を目標にする。
- `fun7772ei/bosai-app`は辞書データの参照元のみ。**変更、push、PR、設定変更を行わない**。privateリポジトリで、Cloudからアクセスできるとは限らない。
- 正式なPhase 2統合・RAG・会話履歴は未実装。88項目の移植・検索だけを今回の指示で比較実験として先行実装した。
- UIの判断は仕様書の範囲で可能だが、当面は診断・省メモリ・保存安定性を優先する。

## 初期WebGPU版の結論（以下は履歴）

**Phase 1のページ実装と公開は済んでいるが、iPadでの成立は未確認。初版で失敗報告があり、最新修正の実機結果待ち。**

ユーザーは、モデル読み込みだけでSafari自体が終了する場合と、「サイトに問題が発生しました」と表示され再読み込みする場合を報告している。メモリ不足、WebGPU、ストレージなどのどれが原因かは断定できない。

続いて「再読み込みでモデルが消えるように見える」「モデル保存が未完了と表示される」と報告。提供JSONから確認できた事実は次のとおり。

- WebGPUとshader-f16の検出は成功。
- 設定・Tokenizerの4ファイルは保存されている。
- `onnx/model_q4f16.onnx`だけが不足。
- q4f16のダウンロード開始から約41秒後、download操作で`Internal error`。
- その後の保存確認でも`Internal error`。
- 保存完了イベントはなく、`runs`も空。

この記録は**重みの保存に失敗した証拠**であり、再読み込みが保存済み重みを削除した証拠ではない。q4/q4f16の取り違えは別に見つけた不具合で、このログの原因ではなかった。ログのUAはSafari 26.5.2・Macintosh表記だが、UAだけから端末型番やiPadOSバージョンを断定しない。WebGPUのmaxBufferSizeは総メモリ上限ではない。

## 初期WebGPU版の実装詳細（履歴）

| ファイル | 役割 |
|---|---|
| `src/config.js` | モデルID・固定revision・対象ファイル・URL正規化・速度計算 |
| `src/chunk-store.js` | 4MiB単位のIndexedDB保存とストリーム読込 |
| `src/model-storage.js` | 新保存＋旧Cache APIの再利用、形式別の存在確認・形式復元 |
| `src/download.js` | ファイルを順に取得し保存。重み全体のarrayBuffer化・clone・チャンク収集を避ける |
| `src/download.worker.js` | ダウンロード専用Worker |
| `src/ai.worker.js` | 保存済みモデルのWebGPU初期化、Tokenizer読込、日本語生成、停止 |
| `src/main.js` | 操作・進捗・メトリクス・診断JSON・途中終了の記録 |
| `public/sw.js` | アプリ本体のオフラインキャッシュ |
| `vite.config.js` | `/bosai-ai/`のbase、ローカルWASM配置、アプリ資産ハッシュ |
| `.github/workflows/pages.yml` | main更新時にテスト・ビルド・Pages公開 |

モデルは `onnx-community/Qwen3-0.6B-ONNX`、revisionは `1e0a4a196ecabdf9a879664110574563d3f372d3`、Transformers.jsは4.3.1。依存はpackage-lockで固定。q4f16が第一候補で、q4は比較用であり、省メモリになるとは限らない。

最新の保存先はIndexedDB `bosai-ai-model-chunks-v1`。`chunks`へ4MiBずつ書き、全transaction完了後に`files`へ完了情報を保存。途中失敗したデータは完了扱いにしない。読込用ResponseのhighWaterMarkは0で、存在確認だけでは重みを読み出さない。旧Cache API `bosai-ai-model-v1`にある正常なファイルは再利用し、旧キャッシュの例外で新しい保存を止めない。

「ダウンロードして保存」と「モデルを読み込む」は別操作。保存後にページ再読み込みを案内する。推論Workerは未保存のHugging Faceファイルの取得を拒否。自動ウォームアップは廃止し、最初の推論は生成ボタンで開始する。

モデル初期化後にTokenizerを読み込み、`enable_thinking: false`、最大128トークン（選択可能64/128/256）。取得を分割しても、Transformers.js／ONNX Runtimeの推論初期化ではモデル全体のメモリ確保が残る。**分割保存だけでiPadの推論クラッシュが直ったとは言えない。**

量子化形式をlocalStorageへ保存。古い版で形式設定がなくても、完全に保存された形式が一つだけなら選択を復元する。localStorageの未完了段階はタブ終了や意図的な再読み込みでも残るので、原因特定ではなく切り分けの材料。

## 当時の確認済みと未確認（履歴）

最新IndexedDB版の開発側検証:

- Node.jsの10テスト成功、本番ビルド成功。
- Windows Playwright Chromiumで12MiB＋123バイトの**ダミー重み**を4分割保存。再読み込み後に各分割のサイズ・内容一致、形式復元、再取得なしを確認。
- 途中失敗を完了扱いしないこと、旧Cache APIのInternal errorを回避できることをテスト。
- オフライン画面表示、未保存ファイルの不足表示、狭い画面での横はみ出しなしを確認。
- 最終実装コミットのPages workflow成功、公開URLのHTTP 200と最新資産を確認。

旧Cache API版ではWindows Chromiumの実モデル生成と、ブラウザのネットワーク遮断後の再読込・生成に成功。ただしその測定値を最新IndexedDB版の実測値やiPadの結果として流用しない。自己紹介依頼を正しく処理できない回答もあり、品質は別問題。

未確認:

- 最新IndexedDB版のiPadでの約570MBモデル保存、再読み込み・Safari終了後の保持。
- 最新IndexedDB版の実モデル初期化・日本語生成・機内モード再利用。
- iPadでの生成速度、長時間安定性、ホーム画面アプリの保存領域・再起動。
- Safari強制終了の具体的原因。

## 初期のCloud作業指示（履歴）

1. 現在のmain、関連ファイル、診断JSONを読み、テストと本番ビルドを再実行する。
2. まず最新IndexedDB版が妥当かをレビューする。大きな分割データ、transaction失敗、容量不足、キャンセル／Worker終了、途中データ、完了manifest、保存形式、再読み込みとオフライン読込を重点確認する。
3. 推論初期化のメモリ負荷・コピー・バッファ割当と、Safari/WebGPUの互換性を調査する。変更は測定・実装根拠に基づく小さなものにする。Qwen3を別モデルへ自動置換しない。
4. 既存のユーザー保存をアプリ更新で削除しない。現在のコードは破損・途中保存に対する完全性保証や中断位置からのダウンロード再開を実装済みではない。必要なら改善し、限界を報告する。
5. iPadなしで実施できた確認と、ユーザー実機で必要な確認を分けた短い手順を用意する。失敗する同じ操作を何度もユーザーに繰り返させない。
6. 作業ブランチに変更と検証結果をまとめ、レビュー可能なPRを作成する。Phase 1の結論と残課題を報告し、Phase 2の着手判断を残す。

追加情報を待つ間もコードレビュー・テスト・軽量化調査を進める。CloudでiPad Safariを直接操作できなければ「実機確認済み」と報告しない。WebKitの自動テストやheadless Chromiumは実機Safariの代替証明ではない。

## 実行方法

Node.js 24以降。環境でnpmレジストリと必要なブラウザ配布先へアクセスできる状態にする。GPUは利用可能か検出して判断し、ない場合は推論成功を捏造しない。外部AI APIの資格情報は不要。

```bash
npm ci
npm test
npm run build
npx playwright install --with-deps chromium
```

本番previewを一つのターミナルで起動:

```bash
npm run preview -- --port 4173
```

別のターミナルで保存経路のテスト:

```bash
node scripts/browser-check.mjs
```

これはダミーデータのテスト。実モデルを使う任意のテストは`node scripts/inference-check.mjs`で、約570MBの取得とWebGPUが必要。現在のスクリプトは診断用であり、終了コードだけでは推論成功を証明できない。ログ・出力・状態を確認し、必要なら成功／失敗判定を改善する。

ブラウザテストはlocalhost:4173に依存する。成果物はgitignore対象の`test-results/`。環境制約でテスト不能なら理由と未確認範囲を記録する。モデル本体をリポジトリやPRへ追加しない。

Cloud環境の設定の参考: [OpenAI公式 Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments)。利用できる機能・権限・ネットワークは実際の環境で確認する。

## Phase 2以降の方向

Phase 2は辞書88項目の移植・軽量検索・根拠付きRAG。Phase 3は会話UI・履歴・詳細画面、Phase 4はPWA保存管理・実機オフライン検証。AIが成立しない場合でも辞書検索を維持する。privateの辞書リポジトリへアクセスできなくても、内容を推測して作らず、その制約を報告する。
