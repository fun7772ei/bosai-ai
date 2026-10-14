"""Create a new evaluation AFTER the review-driven d7be140 freeze; refuse overwrite."""
import json,pathlib,hashlib,datetime,subprocess,collections
p=pathlib.Path('scripts/evaluation/beta-review-final-60.json')
if p.exists():raise SystemExit('Refusing to overwrite held-out evaluation')
rows=[]
def add(kind,q,ids=(),dangerous=()):rows.append(dict(id=f'review-{len(rows)+1:02}',kind=kind,query=q,relevant=[f'bosai-{i}' for i in ids],dangerous=[f'bosai-{i}' for i in dangerous]))
for q,i in [
('自宅でガタガタと大きく揺れ始めた。家具が倒れそうな部屋で身を守るには？',38),
('通勤電車で地震に遭い、立っていて転びそうです。どうすれば？',56),
('帰宅途中の地下鉄車内で地震が起きました。出口へ走るべきですか？',57),
('仕事中にオフィスの書棚が揺れて書類が落ちています。何を優先？',44),
('海の近くのキャンプ場へ行く前に津波への備えを調べたい。',13),
('津波から避難するとき足の遅い家族との連絡や支援を事前に決めたい。',16),
('避難所で発熱や咳がある人が増えています。感染を広げない工夫は？',35),
('配給品にアレルギーの原因となる食材がないか心配です。何を伝える？',32),
('妊娠中に避難所へ来ました。必要な配慮をお願いしてよいですか？',30),
('避難所で高齢の祖母の食欲が落ちて、いつもと様子が違います。',31),
('台風の暴風が強くなりました。家のどこで過ごせばよい？',85),
('天井の照明が消えて停電しました。冷凍庫の中身を何度も確かめてよい？',79),
]:add('normal',q,[i])
for q,i in [
('地面が揺れたとき、上映中の暗いシアターにいたら席をどうする？',46),
('揺れる駅前のビル街で、頭上から看板や破片が落ちそうです。',49),
('住宅の狭い道を歩いていたらぐらっとしました。塀の横は安全？',50),
('渓流のそばで地面が揺れました。崖に近づかないほうがいい？',53),
('就寝中の車内生活が続き、座りっぱなしで足が重いです。予防のためにできることは？',36),
('共同生活では歯磨きに使える水がほとんどありません。口を清潔にしたい。',25),
('避難中の寝具が湿って体が冷えています。暖を保つには？',22),
('避難所で昼間もずっと横になっています。体力を保つためには？',24),
('大雨になる前に庭の鉢植えと物干し竿をどう片付ける？',76),
('スマホの充電がわずかなのに電気が戻りません。長く使う工夫は？',78),
('排水口から汚水が上がらないように、水入りの袋を使う方法を知りたい。',82),
('家で避難生活を続けていても配給などの案内を受けられますか？',37),
]:add('paraphrase',q,[i])
for q,ids,bad in [
('津波が一度来て引いたので、浜へ落とし物を拾いに戻ってもよい？',[7,8],[]),
('津波注意報だけなら堤防から釣りを続けられる？',[5],[]),
('津波に備えて河口の堤防に見物に行ってよいでしょうか？',[9,1],[]),
('大雨で膝まで水がある道路を、足元を確かめながら歩くのは？',[69],[84]),
('大雨でアンダーパスに水があるけど、車高の高い車なら通れる？',[70,86],[69]),
('台風で川が増水しています。橋から水位を見てきてもよい？',[68],[]),
('浸水したコンセントが乾きました。家電をすぐ通電してよい？',[80],[]),
('津波の到達予定よりまだ前なら、浜辺で作業を続けてよい？',[11],[7]),
]:add('danger',q,ids,bad)
for q,ids in [
('停電でスマホも冷蔵庫も心配です。電池と食品を守る情報を探したい。',[78,79]),
('避難所の暑さと、寝てばかりで体力が落ちることを防ぎたい。',[21,24]),
('台風の接近前にベランダの荷物と窓を両方備えたい。',[75,76]),
('避難時に車を置いて歩きます。置き方と主幹ブレーカーの注意を調べたい。',[55,81]),
]:add('multi',q,ids)
for q in [
'明日のこの海岸の波の予報を教えて。',
'現在この地域に大雨注意報はありますか？',
'今朝の津波は何メートルになりましたか？',
'今いちばん近くで開設している避難所はどこ？',
'南町の避難所の受付電話番号を知りたい。',
'市役所から受け取れる見舞金の金額を教えて。',
'子どもの咳を診断してほしい。',
'血圧の薬の服用量を変更する方法は？',
'津波の浸水深を住所から計算してほしい。',
'乾電池を売っている店の営業時間は？',
'二日分の飲み水を沸かすには何分必要ですか？',
'避難所の一食の栄養をグラム単位で計算して。',
'登山中の雪崩で埋まったときの掘り出し方を知りたい。',
'原子力災害で安定ヨウ素剤を飲む時刻は？',
'電気代の減免を申請する用紙を出して。',
'スマホ決済の暗証番号を忘れた。災害時に解除できる？',
]:add('absent',q)
for q in [
'どうしたらいいのか分からず避難を迷っています。',
'家に残るのか外へ出るのか決められません。',
'水が心配なのですが。',
'トイレが困るんだけどどうしたら？',
'上の方へ行けばいいでしょうか。',
'安全なところへ移った方がいいですか？',
'避難について相談したいです。',
'これからどうすればいいですか？',
]:add('ambiguous',q)
assert len(rows)==60
old=set()
for f in ['scripts/evaluation/final-64.json','scripts/evaluation/beta-unseen-80.json','scripts/evaluation/development-40.json']:
 if pathlib.Path(f).exists():old.update(x['query'] for x in json.load(open(f)))
assert len({x['query'] for x in rows})==60 and not old.intersection(x['query'] for x in rows)
p.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
pathlib.Path('docs/diagnostics/beta-review-provenance.json').write_text(json.dumps(dict(createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),freezeCommit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),questions=60,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),counts=dict(collections.Counter(x['kind'] for x in rows)),review='New source-based hand-authored labels after review freeze; not independent disaster-expert evaluation; never tune to these results'),ensure_ascii=False,indent=2)+'\n')
