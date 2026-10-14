# Phase 1：4モデルのCPU/WASM比較

2026-10-14。PR #6（未マージ、commit `5e94403`）を継承し、LFM2.5-350Mに3モデルを追加して比較した。PR #6のマージ、main更新、Pages公開は行わない。比較版のアプリbuildは `b49b4010ddff`、未公開。

## 結論

4モデルすべて、既存wllama/compat **3.8.1 / libllama b11364-46ca246** で初期化・実生成に成功。ランタイム更新、JSPI/MEMORY64への切替、複数スレッド化は不要だった。Qwen系のみ、Jinjaとthinking無効のload/request設定をアプリへ追加した。

品質だけではLFM2-700Mが最良だが、速度・メモリは悪化する。既定のLFM2.5-350M CPU版は維持し、3候補は手動比較用として追加。追加は実機比較を可能にする目的で、全候補の推奨・製品採用ではない。既存WebGPU、選択、量子化、保存済みモデルは維持し、アプリ更新で削除しない。Phase 2・辞書/RAGへは進まない。

## 同条件の結果

| モデル | 既存12問 | 防災文4問 | 合計の厳密遵守率 | アプリ初期化 | TTFT中央値 | 全体tokens/sec中央値 | 32 / 64 tokens実生成 | アプリ全体 / renderer PSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| LFM2.5-350M | 4/12 | 3/4 | 7/16 (43.8%) | 2.21秒 | 2.83秒 | 2.19 | 4.86 / 7.22秒 | 1421 / 819 MiB |
| Qwen3.5-0.8B 日本語SFT v2 | 5/12 | 1/4 | 6/16 (37.5%) | 5.60秒 | 5.01秒 | 1.16 | 10.71 / 16.37秒 | 2088 / 1083 MiB |
| Qwen3-0.6B | 5/12 | 0/4 | 5/16 (31.2%) | 4.16秒 | 5.16秒 | 1.43 | 9.41 / 13.60秒 | 2058 / 1052 MiB |
| LFM2-700M | 6/12 | 3/4 | 9/16 (56.2%) | 3.44秒 | 6.15秒 | 1.30 | 9.82 / 14.70秒 | 1846 / 929 MiB |

全て同じsystem「日本語で簡潔に答えてください。」、temperature 0、1スレッド、文脈512、batch/ubatch64、履歴/prompt cacheなし。Qwenはthinking無効。TTFT/速度中央値は16問・上限32の1回ずつの結果。アプリ初期化は保存済みIndexedDBのBlob読込とnative初期化を含み、ダウンロード時間は含めない。

長文時間は同じ20項目の架空ピクニックリストで、実際に32/64トークンを生成した別試験。16問の短い回答は上限より前に終了するため、区別した。64 tokens時の全体速度は順に8.87 / 3.91 / 4.70 / 4.35 tokens/sec。語彙が違うため、異なるモデルのtokens/secは日本語文字数の同じ速度ではない。TTFT・完了時間と合わせて判断する。

初期化直後の同じ数えるprobeでのTTFTは順に2.13 / 4.19 / 4.18 / 4.43秒。表の16問はこのprobe後の値で、質問の長さも異なるため単純なcold/warm差とは解釈しない。

32→64へ上限だけ変えても、16問の合格件数は4モデルとも同じだった。長いリストや余分な説明が伸びる場合はあっても、分類・情報保持が一様に改善する結果ではない。

### 採点・日本語の読み方

既存12問はPR #6の採点を維持。コピー/行分け/「記載なし」は指定形式を厳密に評価し、要約は指定の時刻と場所の文字列を保持、抽出は既定の等価表記を許容する。防災文4問も事前に期待値を定めた。架空の案内から避難先・数量・通れない場所・未記載時刻を読む課題で、実際の災害助言や最新情報ではない。

この率は小さな固定課題の**厳密遵守率**で、一般的な日本語能力・防災の正答率ではない。引用符、余分なラベル、助詞/表記の違いでも落ちるため、内容が近い回答まで事実誤りと解釈しない。例えばQwen3.5の`「今日は晴れです。」`は内容を保持しているがコピーの形式違反、LFM2-700Mの`体育館正面入口`/`入り口`は意味が近くても旧採点の文字列条件では落ちる。全実出力を以下の生データに残す。

代表的な質的差:

- LFM2.5-350M：コピーは`晴れです。`、食べ物は`パンとタオル`。軽さと既存の実機根拠はあるが、省略・誤分類が残る。
- Qwen3.5日本語SFT v2：通常設定では`パン`を正しく抽出し、要約の時刻も保持。引用符・コロン・ラベルの追加が多い。別の食べ物問題では`石けん、おにぎり、靴下`と返し、分類は成立しない。文章が自然でも内容の正確性とは別。
- Qwen3-0.6B：果物の列挙で質問をそのまま反復。数量コピーには余分な句点、不明時刻にも指定外の句点が付く。防災文の通行止めは`北側の道だけ。`と逆の場所を選んだ。
- LFM2-700M：`今日は晴れです。`のコピーや`赤\n青\n緑`の行分けは成功。一方、コピー別問では`雨明日`、果物説明では`栗とし`など不自然な日本語が出る。通行止めは`北側の道のみ通行止めです。`と誤読。単純な率が最良でも、防災回答を任せられない。

## 推奨生成設定の比較

全て同じ16問・上限32・seed42の参考比較。systemと文脈・threadは変えない。少数例/1seedなので、各設定が常に悪いとは断定しない。

| モデル | 推奨値として試した条件 | 通常 → 推奨の合格 |
|---|---|---:|
| LFM2.5-350M | temperature .1、top_k 50、repeat_penalty 1.05 | 7 → 6 /16 |
| Qwen3.5日本語v2 | 事実問題のtemperature 0、top_k 20、top_p 1、presence_penalty 2、repeat_penalty 1.1 | 6 → 3 /16 |
| Qwen3-0.6B | 非thinking推奨のtemperature .7、top_p .8、top_k 20、min_p 0 | 5 → 4 /16 |
| LFM2-700M | temperature .3、min_p .15、repeat_penalty 1.05 | 9 → 7 /16 |

Qwen3.5の配布元は、会話例ではtemperature 1.0を使う一方、事実/選択問題は0を指定する。今回は後者に合わせた。自由会話のtemperature 1.0は未評価。強いpresence penaltyを含む条件では、食べ物抽出に無関係な栄養の説明などが出たため、presence_penaltyだけ0にする対照16生成も追加。6/16へ戻ったが通常設定を上回らず、アプリに強いpenaltyは採用しない。アプリ追加候補も共通のtemperature 0を使う。

## 互換性・固定ファイル

すべてGGUF version3 / file_type15（Q4_K_M）、text-only。モデル別のrevision、bytes、LFS SHA256を固定し、全ファイルを生成試験前に照合した。通常のQ4_K_Mを使い、LFM2-700MのHIP最適化版は使わない。

| モデル | architecture / blocks / embedding | bytes | 固定revision |
|---|---|---:|---|
| LFM2.5-350M | lfm2 / 16 / 1024 | 229312224 | 657e078c94084481950a2d555a941481f715536b |
| Qwen3.5日本語v2 | qwen35 / 24 / 1024 | 529296736 | a5c9ba2dd9220a0163e82af3a08e2ab4e77c343b |
| Qwen3-0.6B | qwen3 / 28 / 1024 | 484220320 | 60b85c0e3d8fe0f6474f406922a26d12aca4550d |
| LFM2-700M | lfm2 / 16 / 1536 | 468624320 | fd39e80d7a5ac61494ffff577e61bbbfddbd0d02 |

GGUFの組込みチャットテンプレートを使い、独自のChatML文字列へ置き換えない。Qwen3.5日本語v2のテンプレートは配布元の2026-10-03修正版で、非thinking学習に合わせて常に空のthink区間で閉じる。Qwen3はenable_thinking=falseで同じく空区間を挿入する。Qwen系はloadでjinja:true/default_template_kwargs.enable_thinking:false、各requestでもchat_template_kwargs.enable_thinking:false。native reasoningもfalse。192生成のreasoning_content文字数は全て0、thinkタグの出力も検出されなかった。

ライブラリのモデルダウンロード経路は拒否し、アプリでは保存済みGGUFだけを読む。runtime JS/WASMは同梱し、追加CDNや外部AI APIへ質問を送らない。モデル本体はGit/Pagesに含めない。

配布元と推奨値の参照:

- [LFM2.5固定GGUFカード](https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/blob/657e078c94084481950a2d555a941481f715536b/README.md)
- [Qwen3.5日本語v2固定カード](https://huggingface.co/Takenoko12345678/Qwen3.5-0.8B-Japanese-SFT-v2-GGUF/blob/a5c9ba2dd9220a0163e82af3a08e2ab4e77c343b/README.md)（非公式の追加学習モデル）
- [Qwen3量子化の固定カード](https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF/blob/60b85c0e3d8fe0f6474f406922a26d12aca4550d/README.md)、[Qwen3公式推奨の固定カード](https://huggingface.co/Qwen/Qwen3-0.6B/blob/c1899de289a04d12100db370d81485cdf75e47ca/README.md)
- [LFM2-700M固定カード](https://huggingface.co/LiquidAI/LFM2-700M-GGUF/blob/fd39e80d7a5ac61494ffff577e61bbbfddbd0d02/README.md)

配布元のApple M5・native・4thread等の速度は、今回のCPU/WASM 1threadやiPad10へそのまま当てはめない。

## メモリ・安定性と環境制約

Linux AMD EPYC 9V74、CPU quota 2相当、cgroup RAM 8GiB、Node24.19、Chromium149.0.7827.55。推論は常にnative1thread、GPU0。500msごとに/procのPPidからChromium全子プロセスを列挙し、smaps_rollupのPSSを合計した。RSSは共有ページを重複計上するため補助値。Node/Vite/fixture serverとOS全体のページキャッシュは除外する。表のrenderer PSSもWASM heapだけではなくJS/Blob等を含む。

表は**本番previewのIndexedDB分割読込経路**でのload/generateピーク。各モデルで3回の初期化（初回・リセット後・オフライン再読込）を含む。別途、Blob直接配信の比較ハーネス全体PSSは1128 / 1810 / 1705 / 1684 MiBだった。保存/Blob生成/GCの経路で値が変わるため、両者を混同しない。500ms未満のピークを見落とす可能性があり、SafariのメモリやOSの終了閾値と同じ数値ではない。

4モデルとも、16問×3条件の48生成、途中停止、Worker再作成後の再初期化・生成が成功。別の本番previewでもLFM350は通常9生成、追加3候補は各4生成と途中停止が成功。短時間の連続試行で、30分利用・背景復帰・発熱・メモリリーク不存在の証明ではない。モデルを増やしても同時初期化せず、切替前に既存のリセットを使う。

## 失敗と切り分け

- 初期のメモリ監視は、この環境にtask/*/childrenがないため親だけを数えていた。数値は除外し、PPid方式へ修正して再測定。rootのみの値を全体メモリとして使わない回帰テストを追加。
- 比較ハーネスのWorker再作成処理でcounterのスコープを誤った初版は、生成前にReferenceError。修正後に192生成をやり直し、その成功結果だけを評価した。
- メモリ計測用にremote接続したPlaywrightではdownload.pathが使えず、診断保存の試験が失敗。saveAsへ変更して再検証。
- 一時領域の非永続コンテキストではQwen3.5の保存中にQuotaExceededError。モデル初期化へは進んでいない。workspace上の通常永続プロファイルで4モデルの保存・生成が成功し、quota上書きは使っていない。保存条件の差であり、モデル構造非互換やSafariの原因とは扱わない。
- 空メッセージのQuotaExceededErrorが汎用Worker失敗に見えていたため、容量制限の原因を明示するようworker-errorsを修正。既存ファイルの削除はせず、従来の失敗時保持テストを維持。

## iPadでの暫定順位

端末内での軽さ・速度・実機根拠・今回の品質を合わせた**試す優先順位**であり、実機で4モデルを比較した順位ではない。

1. **LFM2.5-350M**：最も軽く速い。ユーザー提供のiPad/Safari短時間生成・リセット後成功ログが唯一ある。既定と安定性の基準として維持。ただし品質は未達。
2. **LFM2-700M**：今回の厳密遵守率が最高で、新候補の中ではメモリも低い。品質を優先して次に1つだけ試す候補。ただし短文のTTFT中央値約6秒、64 tokens約15秒。日本語の不自然さと通行止め誤読が残り、採用確定ではない。
3. **Qwen3.5日本語SFT v2**：日本語の文章・コピー内容保持には改善例があるが、指定形式や分類は不十分。最も大きく、待ち時間・メモリ負担が大きい。強いpresence penaltyは今回不利だった。
4. **Qwen3-0.6B**：通常/推奨とも今回の防災文での優位性を確認できず、反復・誤抽出がある。LFM350より重く遅く、優先してiPadで取得する根拠は弱い。比較対照として残す。

iPad第10世代・Safariで新候補が動くか、PWA再起動後オフライン、長時間は未確認。全3モデルのダウンロードをユーザーへ要求しない。将来公開後に試すならLFM2-700Mだけを明示選択し、保存→読み込み→時刻/場所の短い1問→JSON程度から始める。既存のモデル/アプリ/サイトデータを消す必要はない。オフライン/PWA実機確認はユーザー判断で後回し。

## 最終検証

Node24.19で `NODE_USE_ENV_PROXY=1 npm ci`、48テスト、本番ビルド、ダミーブラウザ検証が成功。実モデルの本番回帰は4モデル合計で通常21生成＋途中停止4件が成功し、各モデルの取得は1回、pageerrorなし。clean npm ci後の全配信資産ハッシュが、実モデルで検証したbuildと一致することも確認した。

## 生データと再現

- [192生成の全入力・出力・採点・時間](diagnostics/cpu-model-comparison.json)（親のみの初期メモリ値はinvalidとして除外）
- [修正後の全体メモリ・32/64実生成](diagnostics/cpu-model-memory-timing.json)
- [集計](diagnostics/cpu-model-summary.json)、[GGUF構造/テンプレート](diagnostics/cpu-model-gguf-metadata.json)、[Qwen3.5 penalty対照](diagnostics/cpu-model-qwen35-presence-control.json)
- 本番previewの各保存・生成・メモリ：[LFM350](diagnostics/cpu-app-lfm2-cpu.json)、[Qwen3.5](diagnostics/cpu-app-qwen35-cpu.json)、[Qwen3](diagnostics/cpu-app-qwen3-cpu.json)、[LFM700](diagnostics/cpu-app-lfm2-700m-cpu.json)

固定GGUFをscripts/cpu-comparison-models.mjsのlocalFileへ置く（test-resultsはGit対象外）。npm ci後に `node scripts/cpu-model-comparison.mjs`、`--probe`で互換性だけ、`--timing-only`で32/64実生成とメモリを測る。結果はtest-results。Qwen3.5の対照は `--model=qwen35-cpu --profile=presence-off`。実モデル取得に通信するが、質問は外部AIへ送らない。

本番回帰はbuildとport4173のpreview後に `node scripts/browser-check.mjs`（ダミー）、`node scripts/cpu-inference-check.mjs`（LFM350）、追加候補は `--model=qwen35-cpu --smoke` 等。後者は固定GGUFで通常永続プロファイルを一時作成し、終了後にその試験用プロファイルだけを掃除する。既存ユーザーの保存には触れない。初期化中にビルドし直さない。
