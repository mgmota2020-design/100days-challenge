"use strict";

/* ==========================================================
   3か月片付けコーチ：A/B の生成ロジック
   - 画面操作はせず、保存データと日付から A/B を組み立てるだけ
   - 日付ユーティリティ（daysBetween / addDays）は script.js のものを使う
   ========================================================== */

const COACH_SOURCE = "cleanup-3months";
const CHALLENGE_TYPE = "cleanup-3months";
const MAX_AREAS = 3;

const RESULT_LABELS = { done: "できた", partial: "少しできた", not_done: "今日はできなかった" };
const RESULT_STATUSES = Object.keys(RESULT_LABELS);

const PROBLEMS = [
  { value: "too_much", label: "物が多い" },
  { value: "no_home", label: "置き場所が決まっていない" },
  { value: "hard_to_return", label: "戻すのが面倒" },
  { value: "gets_messy", label: "すぐ散らかる" },
  { value: "hard_to_discard", label: "捨てる判断に迷う" },
  { value: "dont_know_where_to_start", label: "どこから始めればいいか分からない" }
];

const OUTCOMES = [
  { value: "clear_surfaces", label: "床や机に物を置かなくなった" },
  { value: "fewer_searches", label: "探し物が減った" },
  { value: "tidy_in_15min", label: "散らかっても15分くらいで戻せる" },
  { value: "homes_decided", label: "物の定位置が決まった" },
  { value: "can_reset", label: "散らかっても戻せる" },
  { value: "can_invite", label: "人を呼べる状態になった" },
  { value: "other", label: "その他" }
];

const AREA_STATUS_LABELS = { done: "一区切り", active: "整え中", upcoming: "これから" };

const RESTART_GAP_DAYS = 4;
const REVIEW_INTERVAL_DAYS = 7;
const FIRST_MAINTENANCE_DAYS = 7;
const NEXT_MAINTENANCE_DAYS = 14;
const MAINTENANCE_RETRY_DAYS = 3;
const ITEM_REPEAT_DAYS = 14;
const B_QUEUE_SIZE = 8;

const TITLES = {
  step: "今の場所を少し進める",
  restart: "小さく再開する",
  review: "今週をふり返る",
  maintenance: "前に整えた場所を見る",
  keep: "整えた場所をキープする",
  item: { normal: "モノを5分だけ見直す", smaller: "モノを3分だけ見直す", mini: "モノを少しだけ見る" }
};

const WEEKLY_CHANGE_CHOICES = ["減った", "探しやすくなった", "見た目がラクになった", "戻しやすくなった", "まだよく分からない"];
const RETURNER_CHOICES = ["自分", "家族", "子ども", "みんな"];

/* ==========================================================
   モノ別5分メニュー
   {n} は数、smaller は「少しできた」の翌日用（省略時は数を減らす）
   ========================================================== */

const ITEM_MENU = [
  /* 紙類 */
  { id: "mail", name: "郵便物", category: "paper", reduce: true, n: 10, unit: "枚", instruction: "郵便物を{n}枚だけ、「捨てる／対応する／残す」に分けよう。", finishCondition: "{n}枚見たら今日は終了。", keywords: ["郵便", "手紙", "DM", "はがき"] },
  { id: "school_prints", name: "学校・園プリント", category: "paper", reduce: true, n: 5, unit: "枚", instruction: "学校・園のプリントから、不要と即決できるものを{n}枚抜こう。", finishCondition: "{n}枚抜いたら今日は終了。", keywords: ["プリント", "学校", "園", "お便り", "おたより"] },
  { id: "manuals", name: "取扱説明書", category: "paper", reduce: true, n: 3, unit: "冊", instruction: "今持っていない家電の取扱説明書がないか、{n}冊だけ確認しよう。", finishCondition: "{n}冊見たら今日は終了。", keywords: ["説明書", "取説"] },
  { id: "receipts", name: "レシート", category: "paper", reduce: true, n: 10, unit: "枚", instruction: "レシートを{n}枚だけ確認しよう。", finishCondition: "{n}枚見たら今日は終了。", keywords: ["レシート", "領収書"] },
  { id: "documents", name: "書類", category: "paper", reduce: false, n: 1, unit: "種類", instruction: "書類を1種類だけ選んで、同じ種類を1か所に集めよう。", finishCondition: "集めたら今日は終了。", smaller: "書類を1種類だけ選んで、5枚だけ集めよう。", keywords: ["書類", "紙"] },
  /* 文房具・小物 */
  { id: "pens", name: "ボールペン", category: "stationery", reduce: true, n: 10, unit: "本", instruction: "ボールペンを{n}本だけ試し書きして、書けない物を見つけよう。", finishCondition: "{n}本試したら今日は終了。", keywords: ["ペン", "文房具", "筆記"] },
  { id: "pencils", name: "鉛筆・色鉛筆", category: "stationery", reduce: true, n: 5, unit: "本", instruction: "鉛筆・色鉛筆を{n}本だけ確認しよう。短すぎる物や折れた物はない？", finishCondition: "{n}本見たら今日は終了。", keywords: ["鉛筆", "色鉛筆", "文房具"] },
  { id: "markers", name: "マーカー", category: "stationery", reduce: true, n: 5, unit: "本", instruction: "マーカーを{n}本だけ試し書きしよう。", finishCondition: "{n}本試したら今日は終了。", keywords: ["マーカー", "ペン", "文房具"] },
  { id: "scissors_glue", name: "ハサミ・のり", category: "stationery", reduce: false, n: 1, unit: "個", instruction: "ハサミとのりを集めて、よく使う物を1つずつ決めよう。", finishCondition: "決めたら今日は終了。", smaller: "ハサミだけ集めて、よく使う1本を決めよう。", keywords: ["ハサミ", "のり", "文房具"] },
  { id: "cables", name: "充電ケーブル", category: "gadget", reduce: true, n: 5, unit: "本", instruction: "充電ケーブルを{n}本だけ確認しよう。使っていない物はない？", finishCondition: "{n}本見たら今日は終了。", keywords: ["ケーブル", "コード", "充電"] },
  { id: "chargers", name: "充電器・アダプタ", category: "gadget", reduce: true, n: 3, unit: "個", instruction: "充電器・アダプタを{n}個だけ確認しよう。何の充電器か分かる？", finishCondition: "{n}個見たら今日は終了。", keywords: ["充電器", "アダプタ", "充電"] },
  { id: "old_phone_items", name: "古いスマホ用品", category: "gadget", reduce: true, n: 3, unit: "個", instruction: "古いスマホケースや付属品を{n}個だけ確認しよう。", finishCondition: "{n}個見たら今日は終了。", keywords: ["スマホ", "ケース"] },
  /* 衣類 */
  { id: "tshirts", name: "Tシャツ", category: "clothes", reduce: true, n: 3, unit: "枚", instruction: "最近選ばないTシャツを{n}枚だけ見てみよう。", finishCondition: "{n}枚見たら今日は終了。", keywords: ["Tシャツ", "服", "衣類"] },
  { id: "socks", name: "靴下", category: "clothes", reduce: true, n: 5, unit: "足", instruction: "靴下を{n}足だけ確認しよう。片方だけの物や穴あきはない？", finishCondition: "{n}足見たら今日は終了。", keywords: ["靴下", "服", "衣類"] },
  { id: "underwear", name: "下着", category: "clothes", reduce: true, n: 3, unit: "枚", instruction: "下着を{n}枚だけ確認しよう。", finishCondition: "{n}枚見たら今日は終了。", keywords: ["下着", "衣類"] },
  { id: "pajamas", name: "パジャマ", category: "clothes", reduce: false, n: 1, unit: "着", instruction: "パジャマの中から、今使っている一軍を確認しよう。", finishCondition: "確認したら今日は終了。", smaller: "今着ているパジャマ以外を、1着だけ見てみよう。", keywords: ["パジャマ", "服", "衣類"] },
  { id: "outerwear", name: "アウター", category: "clothes", reduce: true, n: 3, unit: "着", instruction: "アウターを{n}着だけ見てみよう。次の季節も着る？", finishCondition: "{n}着見たら今日は終了。", keywords: ["アウター", "コート", "上着", "服"] },
  { id: "kids_clothes", name: "子ども服", category: "clothes", reduce: true, n: 5, unit: "枚", instruction: "子ども服から、明らかなサイズアウトを{n}枚確認しよう。", finishCondition: "{n}枚見たら今日は終了。", keywords: ["子ども服", "子供服", "服"] },
  /* バッグ・身につける物 */
  { id: "bag", name: "バッグ", category: "bags", reduce: false, n: 1, unit: "個", instruction: "バッグを1個だけ選んで、中身を全部出してみよう。", finishCondition: "出して戻したら今日は終了。", smaller: "バッグを1個だけ選んで、ゴミとレシートだけ出そう。", keywords: ["バッグ", "かばん", "鞄"] },
  { id: "eco_bags", name: "エコバッグ", category: "bags", reduce: true, n: 3, unit: "枚", instruction: "エコバッグを集めて、よく使う{n}枚を選ぼう。", finishCondition: "選んだら今日は終了。", keywords: ["エコバッグ", "袋"] },
  { id: "shoes", name: "靴", category: "bags", reduce: true, n: 3, unit: "足", instruction: "靴を{n}足だけ見てみよう。最近はいている？", finishCondition: "{n}足見たら今日は終了。", keywords: ["靴", "玄関"] },
  { id: "accessories", name: "アクセサリー", category: "bags", reduce: true, n: 5, unit: "個", instruction: "アクセサリーを{n}個だけ確認しよう。", finishCondition: "{n}個見たら今日は終了。", keywords: ["アクセサリー"] },
  /* 洗面・寝具 */
  { id: "cosmetics", name: "化粧品", category: "bath", reduce: true, n: 3, unit: "つ", instruction: "化粧品の中から、最近使っていない物を{n}つ確認しよう。", finishCondition: "{n}つ見たら今日は終了。", keywords: ["化粧品", "コスメ", "洗面"] },
  { id: "samples", name: "試供品", category: "bath", reduce: true, n: 5, unit: "個", instruction: "試供品を{n}個だけ確認しよう。使う予定はある？", finishCondition: "{n}個見たら今日は終了。", keywords: ["試供品", "サンプル", "洗面"] },
  { id: "hair_items", name: "ヘア用品", category: "bath", reduce: false, n: 1, unit: "種類", instruction: "ヘア用品を1種類だけ選んで、1か所にまとめよう。", finishCondition: "まとめたら今日は終了。", smaller: "ヘアゴムかヘアピンだけ、1か所にまとめよう。", keywords: ["ヘア", "洗面"] },
  { id: "towels", name: "タオル", category: "bath", reduce: true, n: 5, unit: "枚", instruction: "タオルを{n}枚だけ確認しよう。薄くなった物はない？", finishCondition: "{n}枚見たら今日は終了。", keywords: ["タオル", "洗面"] },
  { id: "bedding", name: "シーツ・寝具", category: "bath", reduce: false, n: 1, unit: "セット", instruction: "シーツ・寝具を1セットだけ確認しよう。", finishCondition: "確認したら今日は終了。", smaller: "予備のシーツを1枚だけ見てみよう。", keywords: ["シーツ", "寝具", "布団"] },
  /* キッチン */
  { id: "dishes", name: "食器", category: "kitchen", reduce: true, n: 5, unit: "個", instruction: "食器を{n}個だけ確認しよう。最近使った？", finishCondition: "{n}個見たら今日は終了。", keywords: ["食器", "皿", "キッチン"] },
  { id: "mugs", name: "マグカップ", category: "kitchen", reduce: true, n: 1, unit: "個", instruction: "マグカップを並べて、普段使う物を選ぼう。", finishCondition: "選んだら今日は終了。", smaller: "マグカップを3個だけ見て、普段使う物を選ぼう。", keywords: ["マグ", "コップ", "カップ", "キッチン"] },
  { id: "containers", name: "保存容器", category: "kitchen", reduce: true, n: 1, unit: "個", instruction: "保存容器のフタと本体を合わせて、合わない物を見つけよう。", finishCondition: "合わせ終わったら今日は終了。", smaller: "保存容器を5個だけ、フタと本体を合わせよう。", keywords: ["保存容器", "タッパー", "キッチン"] },
  { id: "bottles", name: "水筒・ボトル", category: "kitchen", reduce: true, n: 3, unit: "本", instruction: "水筒・ボトルを{n}本だけ確認しよう。パッキンはそろっている？", finishCondition: "{n}本見たら今日は終了。", keywords: ["水筒", "ボトル", "キッチン"] },
  { id: "cutlery", name: "カトラリー", category: "kitchen", reduce: false, n: 1, unit: "種類", instruction: "スプーンやフォークなど、カトラリーを1種類だけ確認しよう。", finishCondition: "確認したら今日は終了。", smaller: "スプーンだけ、数を見てみよう。", keywords: ["カトラリー", "スプーン", "フォーク", "箸", "キッチン"] },
  { id: "seasonings", name: "調味料", category: "kitchen", reduce: true, n: 5, unit: "本", instruction: "調味料を{n}本だけ、期限を確認しよう。", finishCondition: "{n}本見たら今日は終了。", keywords: ["調味料", "キッチン"] },
  { id: "fridge_food", name: "冷蔵庫食品", category: "kitchen", reduce: true, n: 5, unit: "品", instruction: "冷蔵庫の食品を{n}品だけ、期限を確認しよう。", finishCondition: "{n}品見たら今日は終了。", keywords: ["冷蔵庫", "食品"] },
  { id: "pantry", name: "乾物・缶詰", category: "kitchen", reduce: true, n: 5, unit: "個", instruction: "乾物・缶詰を{n}個だけ、期限を確認しよう。", finishCondition: "{n}個見たら今日は終了。", keywords: ["乾物", "缶詰", "ストック", "食品"] },
  { id: "snacks", name: "お菓子", category: "kitchen", reduce: false, n: 1, unit: "か所", instruction: "開封済みのお菓子を1か所にまとめよう。", finishCondition: "まとめたら今日は終了。", smaller: "開封済みのお菓子を3つだけ集めよう。", keywords: ["お菓子", "おやつ"] },
  /* 日用品 */
  { id: "medicine", name: "薬・衛生用品", category: "daily", reduce: true, n: 5, unit: "個", instruction: "薬・衛生用品を{n}個だけ、期限を確認しよう。", finishCondition: "{n}個見たら今日は終了。", keywords: ["薬", "衛生"] },
  { id: "detergents", name: "洗剤", category: "daily", reduce: false, n: 1, unit: "か所", instruction: "洗剤を並べて、同じ用途の物が何個あるか確認しよう。", finishCondition: "数えたら今日は終了。", smaller: "キッチンの洗剤だけ、何個あるか見てみよう。", keywords: ["洗剤"] },
  { id: "cleaning_tools", name: "掃除用品", category: "daily", reduce: true, n: 5, unit: "個", instruction: "掃除用品を{n}個だけ確認しよう。使っていない物はない？", finishCondition: "{n}個見たら今日は終了。", keywords: ["掃除"] },
  { id: "paper_bags_boxes", name: "紙袋・空き箱", category: "daily", reduce: true, n: 5, unit: "個", instruction: "紙袋・空き箱を{n}個だけ、残すか手放すか決めよう。", finishCondition: "{n}個決めたら今日は終了。", keywords: ["紙袋", "空き箱", "箱", "袋"] },
  /* 子どもの物 */
  { id: "toys", name: "おもちゃ", category: "kids", reduce: true, n: 5, unit: "個", instruction: "おもちゃを{n}個だけ確認しよう。最近遊んでいる？", finishCondition: "{n}個見たら今日は終了。", keywords: ["おもちゃ", "玩具"] },
  { id: "books", name: "絵本・本", category: "kids", reduce: true, n: 5, unit: "冊", instruction: "絵本・本を{n}冊だけ確認しよう。", finishCondition: "{n}冊見たら今日は終了。", keywords: ["絵本", "本"] },
  { id: "artwork", name: "工作・作品", category: "kids", reduce: false, n: 1, unit: "つ", instruction: "工作・作品から、残したい物を1つ決めよう。", finishCondition: "決めたら今日は終了。", smaller: "工作・作品を3つだけ見てみよう。", keywords: ["工作", "作品"] },
  { id: "plush", name: "ぬいぐるみ", category: "kids", reduce: false, n: 1, unit: "つ", instruction: "ぬいぐるみを並べて、よく遊ぶ物を確認しよう。", finishCondition: "確認したら今日は終了。", smaller: "ぬいぐるみを3つだけ見てみよう。", keywords: ["ぬいぐるみ"] },
  /* その他 */
  { id: "mystery_items", name: "謎の小物", category: "other", reduce: true, n: 5, unit: "個", instruction: "「何に使うか分からない物」を{n}個だけ集めよう。", finishCondition: "{n}個集めたら今日は終了。", keywords: ["小物", "謎"] }
].map((item) => ({ ...item, minutes: 5 }));

const CATEGORY_LABELS = {
  paper: "紙類",
  stationery: "文房具",
  gadget: "スマホまわりの小物",
  clothes: "衣類",
  bags: "バッグや靴",
  bath: "洗面・寝具",
  kitchen: "キッチン",
  daily: "日用品",
  kids: "子どもの物",
  other: "小物"
};

function getItemById(itemId) {
  return ITEM_MENU.find((item) => item.id === itemId) || null;
}

/* ==========================================================
   重点エリアの段階
   1. 減らす 2. 同じ種類を集める 3. よく使う物を確認 4. 定位置を決める 5. 戻せるか試す
   ========================================================== */

const STEP_SEQUENCES = {
  too_much: ["light_clear", "find_most", "reduce_most", "see_cause", "reduce_easy", "make_space", "gather", "frequency", "decide_home", "reset_test"],
  hard_to_discard: ["light_clear", "find_most", "gather", "see_cause", "reduce_easy", "make_space", "frequency", "reduce_most", "decide_home", "reset_test"],
  no_home: ["light_clear", "find_most", "see_cause", "reduce_easy", "gather", "frequency", "decide_home", "reset_test"],
  hard_to_return: ["light_clear", "see_cause", "find_most", "reduce_easy", "gather", "frequency", "decide_home", "reset_test"],
  gets_messy: ["light_clear", "see_cause", "reduce_easy", "make_space", "find_most", "gather", "frequency", "decide_home", "reset_test"],
  dont_know_where_to_start: ["light_clear", "reduce_easy", "find_most", "reduce_most", "see_cause", "make_space", "gather", "frequency", "decide_home", "reset_test"]
};

/* 2か所目以降は、初週向けの「原因を見る」「空間を作る」を省いてテンポよく進める */
const FIRST_AREA_ONLY_STEPS = ["see_cause", "make_space"];
const REDUCE_STEPS = ["reduce_most", "reduce_easy"];

function quote(text) {
  return `「${text}」`;
}

function pickVariant(variants, seed) {
  return variants[Math.abs(seed) % variants.length];
}

function fillCount(text, n) {
  return text.replace(/\{n\}/g, String(n));
}

/* 段階ごとの文章。normal・smaller は2通り、mini は3段階 */
function getStepLibrary(step, words) {
  const { area, item, gatherItem, home, useSpot } = words;
  const homeWords = home ? quote(home) : "決めた場所";

  const library = {
    light_clear: {
      normal: [
        { headline: `${area}から、別の場所に戻せる物を5つ戻そう。`, details: ["ゴミがあれば一緒に捨ててOK。"], finish: "5つ戻したら今日は終了。", minutes: 5 },
        { headline: `${area}の上にある物から、明らかなゴミを5つ捨てよう。`, details: ["迷う物は、今日は残してOK。"], finish: "5つ捨てたら今日は終了。", minutes: 5 }
      ],
      smaller: [
        { headline: `${area}から、戻せる物を3つだけ戻そう。`, finish: "3つ戻したら今日は終了。", minutes: 3 },
        { headline: `${area}のゴミを3つだけ捨てよう。`, finish: "3つ捨てたら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${area}から、ゴミを3つだけ見つけよう。`, finish: "3つ見つけたら今日は終了。" },
        { headline: `今日は2分だけ。${area}を眺めて、戻せそうな物を1つ見つけよう。`, finish: "見つけるだけでOK。" },
        { headline: `今日は2分だけ。${area}の物を1つだけ、元の場所に戻そう。`, finish: "1つで十分です。" }
      ],
      followUp: { key: "remaining", label: "まだ残っている物は？", type: "text" }
    },
    find_most: {
      normal: [
        { headline: `${area}で一番多いモノは何か、5分だけ見てみよう。`, details: ["数えなくてOK。紙類・小物・服など、ざっくりで大丈夫。"], finish: "分かったら今日は終了。", minutes: 5 },
        { headline: `${area}の物を、ざっくり種類ごとに眺めてみよう。どの種類が多い？`, details: ["動かさなくて大丈夫。"], finish: "見るだけで今日は終了。", minutes: 5 }
      ],
      smaller: [
        { headline: `${area}をパッと見て、多そうなモノを1つ挙げよう。`, finish: "1つ挙げたら今日は終了。", minutes: 3 },
        { headline: `${area}で、よく見かける物を1つ挙げよう。`, finish: "1つ挙げたら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${area}を眺めて、目につく物を1つ思い浮かべよう。`, finish: "思い浮かべるだけでOK。" },
        { headline: `今日は2分だけ。${area}の前に立って、少し眺めるだけでOK。`, finish: "眺めたら今日は終了。" },
        { headline: `今日は2分だけ。${area}にある物の種類を、1つだけ思い浮かべよう。`, finish: "思い浮かべるだけでOK。" }
      ],
      followUp: { key: "mostItem", label: "一番多かったモノは？", type: "text" }
    },
    reduce_most: {
      normal: [
        { headline: `${item}を5分だけ見て、手放せる物を3つ選ぼう。`, details: ["捨てるか迷う物は、今日は残してOK。"], finish: "3つ選んだら今日は終了。", minutes: 5 },
        { headline: `${item}から、明らかにいらない物を3つ減らそう。`, details: ["迷う物は、今日はそのままでOK。"], finish: "3つ減らしたら今日は終了。", minutes: 5 }
      ],
      smaller: [
        { headline: `${item}から、手放せる物を1つだけ選ぼう。`, finish: "1つ選んだら今日は終了。", minutes: 3 },
        { headline: `${item}を3つだけ見て、いらない物がないか確かめよう。`, finish: "3つ見たら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${item}を手に取って、眺めるだけでOK。`, finish: "眺めたら今日は終了。" },
        { headline: `今日は2分だけ。${item}がどこにあるか、見るだけでOK。`, finish: "見るだけで今日は終了。" },
        { headline: `今日は2分だけ。${item}の中から、1つだけ手に取ってみよう。`, finish: "それで今日は終了。" }
      ],
      followUp: null
    },
    see_cause: {
      normal: [
        { lead: "今日は軽めに。", headline: `${area}に出ている物を3つ見て、なぜここに来たか考えてみよう。`, finish: "考えるだけで今日は終了。", minutes: 3 },
        { lead: "今日は軽めに。", headline: `${area}で、いつも置きっぱなしになる物を1つ見つけよう。`, finish: "見つけたら今日は終了。", minutes: 3 }
      ],
      smaller: [
        { headline: `${area}に出ている物を1つだけ見て、なぜここにあるか考えよう。`, finish: "考えるだけで今日は終了。", minutes: 2 },
        { headline: `${area}で、置きっぱなしの物を1つ見つけよう。`, finish: "見つけたら今日は終了。", minutes: 2 }
      ],
      mini: [
        { headline: `今日は2分だけ。${area}を見て、気になる物を1つ思い浮かべよう。`, finish: "思い浮かべるだけでOK。" },
        { headline: `今日は2分だけ。${area}の前を通るとき、1回だけ見てみよう。`, finish: "見るだけで今日は終了。" },
        { headline: `今日は2分だけ。${area}に一番よく置かれる物を、1つ思い浮かべよう。`, finish: "思い浮かべるだけでOK。" }
      ],
      followUp: { key: "cause", label: "散らかる原因になっていそうな物は？", type: "text" }
    },
    reduce_easy: {
      normal: [
        { headline: `${area}から、迷わず手放せる物を5つ減らそう。`, details: ["ゴミ・空き箱・期限切れ・壊れた物など。"], finish: "5つ減らしたら今日は終了。", minutes: 5 },
        { headline: `${area}の紙袋・空き箱・ゴミだけ、5つ手放そう。`, details: ["判断に迷う物は、今日は対象外。"], finish: "5つ手放したら今日は終了。", minutes: 5 }
      ],
      smaller: [
        { headline: `${area}から、迷わず手放せる物を3つだけ減らそう。`, finish: "3つ減らしたら今日は終了。", minutes: 3 },
        { headline: `${area}の空き箱や紙袋を、2つだけ手放そう。`, finish: "2つ手放したら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${area}から、ゴミを1つだけ捨てよう。`, finish: "1つで十分です。" },
        { headline: `今日は2分だけ。${area}で、手放せそうな物を1つ見つけるだけでOK。`, finish: "見つけたら今日は終了。" },
        { headline: `今日は2分だけ。${area}の紙くずや空き袋を、1つだけ捨てよう。`, finish: "1つで十分です。" }
      ],
      followUp: null
    },
    make_space: {
      normal: [
        { headline: `${area}に、手のひら2つ分だけ何も置かない場所を作ろう。`, finish: "空いたら今日は終了。", minutes: 5 },
        { headline: `${area}の端から物を5つどけて、空いた場所を作ろう。`, details: ["どけた物は、戻す場所がなければ1か所にまとめてOK。"], finish: "空いたら今日は終了。", minutes: 5 }
      ],
      smaller: [
        { headline: `${area}に、手のひら1つ分の空いた場所を作ろう。`, finish: "空いたら今日は終了。", minutes: 3 },
        { headline: `${area}から物を3つどけて、少しだけ空けよう。`, finish: "空いたら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${area}から、物を1つだけどけてみよう。`, finish: "1つで十分です。" },
        { headline: `今日は2分だけ。${area}の空いている所を見つけるだけでOK。`, finish: "見つけたら今日は終了。" },
        { headline: `今日は2分だけ。${area}の角から、物を1つだけ移そう。`, finish: "1つで十分です。" }
      ],
      followUp: null
    },
    gather: {
      normal: [
        { headline: `${area}の${gatherItem}を、1か所に集めよう。`, details: ["分けたり捨てたりしなくてOK。"], finish: "集めたら今日は終了。", minutes: 5 },
        { headline: `${gatherItem}を、今ある箱や袋に1か所にまとめよう。`, details: ["入れ物は、家にある物でOK。"], finish: "まとめたら今日は終了。", minutes: 5 }
      ],
      smaller: [
        { headline: `${gatherItem}を、5つだけ1か所に集めよう。`, finish: "5つ集めたら今日は終了。", minutes: 3 },
        { headline: `${gatherItem}を3つだけ、1か所に置こう。`, finish: "3つ置いたら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${gatherItem}を3つだけ集めよう。`, finish: "3つ集めたら今日は終了。" },
        { headline: `今日は2分だけ。${gatherItem}を1つだけ、まとめる場所に置こう。`, finish: "1つで十分です。" },
        { headline: `今日は2分だけ。${gatherItem}がいくつあるか、ざっと見てみよう。`, finish: "見るだけでOK。" }
      ],
      followUp: null
    },
    frequency: {
      normal: [
        { headline: `集めた${gatherItem}から、よく使う物を3つ選ぼう。`, details: ["残りは、今日はそのままでOK。"], finish: "3つ選んだら今日は終了。", minutes: 5 },
        { headline: `${gatherItem}を「よく使う」「たまに使う」の2つに分けよう。`, details: ["迷う物は「たまに使う」でOK。"], finish: "分けたら今日は終了。", minutes: 5 }
      ],
      smaller: [
        { headline: `${gatherItem}から、よく使う物を1つだけ選ぼう。`, finish: "1つ選んだら今日は終了。", minutes: 3 },
        { headline: `${gatherItem}を3つだけ見て、よく使うか考えよう。`, finish: "3つ見たら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${gatherItem}の中で、一番よく使う物を思い浮かべよう。`, finish: "思い浮かべるだけでOK。" },
        { headline: `今日は2分だけ。${gatherItem}を眺めるだけでOK。`, finish: "眺めたら今日は終了。" },
        { headline: `今日は2分だけ。${gatherItem}の中から、最近使った物を1つ思い出そう。`, finish: "思い出すだけでOK。" }
      ],
      followUp: { key: "useSpot", label: "よく使う物は、どこで使う？", type: "text" }
    },
    decide_home: {
      normal: [
        {
          headline: useSpot
            ? `よく使う${gatherItem}の戻す場所を、${quote(useSpot)}の近くで1か所決めよう。`
            : `よく使う${gatherItem}の戻す場所を1か所決めよう。`,
          details: ["収納用品は買わなくてOK。今ある場所から選ぼう。"],
          finish: "決めたら今日は終了。",
          minutes: 5
        },
        { headline: `${gatherItem}の「ここに戻す」を1か所決めよう。`, details: ["使う場所の近くが目安。収納用品は買わなくてOK。"], finish: "決めたら今日は終了。", minutes: 5 }
      ],
      smaller: [
        { lead: "仮でOK。", headline: `${gatherItem}の置き場所の候補を1つだけ決めよう。`, details: ["あとで変えて大丈夫。"], finish: "決めたら今日は終了。", minutes: 3 },
        { lead: "仮でOK。", headline: `${gatherItem}を置けそうな場所を2つ思い浮かべて、1つに決めよう。`, details: ["あとで変えて大丈夫。"], finish: "決めたら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${gatherItem}の置き場所の候補を、1つ思い浮かべよう。`, finish: "思い浮かべるだけでOK。", followUp: { key: "home", label: "思い浮かんだ場所は？", type: "text" } },
        { headline: `今日は2分だけ。${gatherItem}をいつもどこで使うか、思い出すだけでOK。`, finish: "思い出したら今日は終了。", followUp: null },
        { headline: `今日は2分だけ。${gatherItem}を使う場所の近くを、1回見てみよう。`, finish: "見るだけでOK。", followUp: null }
      ],
      followUp: { key: "home", label: "どこに決めた？", type: "text", requiredOnDone: true }
    },
    reset_test: {
      normal: [
        { headline: `${gatherItem}を${homeWords}に戻せるか試そう。`, details: ["実際に1回戻してみるだけでOK。", "戻しにくかったら、それも大事な発見です。"], finish: "戻せたら今日は終了。", minutes: 5 },
        { headline: `${homeWords}から${gatherItem}を出して、もう一度戻してみよう。`, details: ["取り出しやすい？ 戻しやすい？"], finish: "1回戻したら今日は終了。", minutes: 5 }
      ],
      smaller: [
        { headline: `${gatherItem}を1つだけ、${homeWords}に戻してみよう。`, finish: "1つ戻したら今日は終了。", minutes: 3 },
        { headline: `${homeWords}から${gatherItem}を1つ出して、また戻してみよう。`, finish: "1回戻したら今日は終了。", minutes: 3 }
      ],
      mini: [
        { headline: `今日は2分だけ。${homeWords}を見に行くだけでOK。`, finish: "見たら今日は終了。" },
        { headline: `今日は2分だけ。${gatherItem}を1つ手に取ってみよう。`, finish: "それで今日は終了。" },
        { headline: `今日は2分だけ。${homeWords}に、${gatherItem}が入りそうか見てみよう。`, finish: "見るだけでOK。" }
      ],
      followUp: { key: "returner", label: "ここに戻すのは、誰が多い？", type: "choice", choices: RETURNER_CHOICES }
    }
  };
  return library[step];
}

/* ==========================================================
   履歴の読み取り
   ========================================================== */

function isChallengeRecord(record) {
  return Boolean(record && record.dailyOptions && record.dailyOptions.A && record.dailyOptions.B);
}

function isWeekendMiniRecord(record) {
  return Boolean(record && record.coachMeta && record.coachMeta.mode === "weekend-mini");
}

function getSeasonHistory(data, beforeDate) {
  const challenge = data.challenge;
  if (!challenge) return [];
  return Object.keys(data.records)
    .filter((dateKey) => dateKey >= challenge.startDate && dateKey < beforeDate
      && isChallengeRecord(data.records[dateKey]) && !isWeekendMiniRecord(data.records[dateKey]))
    .sort()
    .map((dateKey) => ({ date: dateKey, record: data.records[dateKey] }));
}

/* その日に実際に表示されていた内容（小さい版に切り替えていれば小さい版） */
function getEffectiveOption(record, slot) {
  const option = record.dailyOptions[slot];
  if (!option) return null;
  if (record.selectedOption === slot && record.miniActive && option.mini) {
    return { ...option, ...option.mini };
  }
  return option;
}

function getSelectedEffectiveOption(record) {
  return record.selectedOption ? getEffectiveOption(record, record.selectedOption) : null;
}

/* 前回、ユーザーが明示的に保存した通常結果。未選択・未保存の日は分岐に使わない */
function getPreviousResult(history) {
  const answered = history.filter((entry) => entry.record.resultStatus && entry.record.selectedOption);
  if (!answered.length) return null;
  const { date, record } = answered[answered.length - 1];
  const slot = record.selectedOption;
  return {
    date,
    record,
    slot,
    selected: true,
    status: record.resultStatus,
    option: getEffectiveOption(record, slot)
  };
}

/* 最後の保存結果から今日までに、結果を残さず過ぎた平日の数 */
function countMissedWeekdays(fromDate, toDate) {
  let count = 0;
  let cursor = addDays(fromDate, 1);
  while (cursor < toDate) {
    if (!isWeekendDate(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function getAreaById(challenge, areaId) {
  return challenge.areas.find((area) => area.id === areaId) || null;
}

function getCurrentArea(challenge) {
  return getAreaById(challenge, challenge.currentAreaId);
}

/* 段階の完了：「できた」、または小さい版を「少しできた」まで進めた */
function getCompletedSteps(data, areaId) {
  const completed = new Map();
  Object.keys(data.records).sort().forEach((dateKey) => {
    const record = data.records[dateKey];
    if (!isChallengeRecord(record) || record.selectedOption !== "A" || dateKey < data.challenge.startDate) return;
    const option = getEffectiveOption(record, "A");
    if (option.kind !== "step" || option.areaId !== areaId) return;
    const status = record.resultStatus;
    const counts = (status === "done" && option.size !== "mini") || (status === "partial" && option.size === "smaller");
    if (counts && !completed.has(option.step)) completed.set(option.step, dateKey);
  });
  return completed;
}

function isAreaMilestone(completed) {
  return REDUCE_STEPS.some((step) => completed.has(step)) && completed.has("decide_home") && completed.has("reset_test");
}

function getStepSequence(challenge, area) {
  const sequence = STEP_SEQUENCES[challenge.primaryProblem] || STEP_SEQUENCES.too_much;
  const isFirstArea = challenge.areas[0] && challenge.areas[0].id === area.id;
  return isFirstArea ? sequence : sequence.filter((step) => !FIRST_AREA_ONLY_STEPS.includes(step));
}

function getNextStep(data, area) {
  const completed = getCompletedSteps(data, area.id);
  return getStepSequence(data.challenge, area).find((step) => !completed.has(step)) || "reset_test";
}

/* エリアで回答された内容（一番多いモノ・決めた場所など）。最新の回答を使う */
function getAreaMemory(data, areaId) {
  const memory = {};
  Object.keys(data.records).sort().forEach((dateKey) => {
    const record = data.records[dateKey];
    if (dateKey < data.challenge.startDate) return;
    if (!isChallengeRecord(record) || record.selectedOption !== "A") return;
    const option = getEffectiveOption(record, "A");
    if (option.areaId !== areaId || !record.responseData) return;
    Object.keys(record.responseData).forEach((key) => {
      if (record.responseData[key]) memory[key] = record.responseData[key];
    });
  });
  return memory;
}

function getStepWords(data, area) {
  const memory = getAreaMemory(data, area.id);
  const mostItem = memory.mostItem || "";
  return {
    area: quote(area.name),
    item: mostItem ? quote(mostItem) : `${quote(area.name)}で一番多いモノ`,
    gatherItem: mostItem ? quote(mostItem) : "同じ種類の物",
    home: memory.home || "",
    useSpot: memory.useSpot || ""
  };
}

/* ==========================================================
   状態の更新（一区切り・再確認）
   ========================================================== */

function updateAreaState(data, dateKey) {
  const challenge = data.challenge;
  if (!challenge) return;

  const current = getCurrentArea(challenge);
  if (current && current.status !== "done") {
    const completed = getCompletedSteps(data, current.id);
    if (isAreaMilestone(completed)) {
      current.status = "done";
      current.completedDate = [...completed.values()].sort().pop() || dateKey;
      const next = challenge.areas.find((area) => area.status === "upcoming");
      if (next) {
        next.status = "active";
        next.startedDate = dateKey;
        challenge.currentAreaId = next.id;
      } else {
        challenge.currentAreaId = null;
      }
    }
  }

  challenge.areas.forEach((area) => {
    if (area.status !== "done") return;
    const reviewed = getMaintenanceDates(data, area.id, true);
    if (reviewed.length) area.lastReviewedDate = reviewed[reviewed.length - 1];
  });
}

function getMaintenanceDates(data, areaId, answeredOnly) {
  return Object.keys(data.records).sort().filter((dateKey) => {
    const record = data.records[dateKey];
    if (!isChallengeRecord(record) || dateKey < data.challenge.startDate) return false;
    const option = record.dailyOptions.A;
    if (option.kind !== "maintenance" || option.areaId !== areaId) return false;
    if (!answeredOnly) return true;
    return record.selectedOption === "A" && (record.resultStatus === "done" || record.resultStatus === "partial");
  });
}

function getDueMaintenanceArea(data, dateKey) {
  let dueArea = null;
  let longestWait = -1;
  data.challenge.areas.forEach((area) => {
    if (area.status !== "done" || !area.completedDate) return;
    const since = area.lastReviewedDate || area.completedDate;
    const threshold = area.lastReviewedDate ? NEXT_MAINTENANCE_DAYS : FIRST_MAINTENANCE_DAYS;
    const waited = daysBetween(since, dateKey);
    const offered = getMaintenanceDates(data, area.id, false).filter((date) => date < dateKey);
    const lastOffered = offered[offered.length - 1];
    const recentlyOffered = lastOffered && lastOffered > since && daysBetween(lastOffered, dateKey) < MAINTENANCE_RETRY_DAYS;
    if (waited >= threshold && !recentlyOffered && waited > longestWait) {
      dueArea = area;
      longestWait = waited;
    }
  });
  return dueArea;
}

function isWeeklyReviewDue(context) {
  if (context.challengeDay < REVIEW_INTERVAL_DAYS) return false;
  const reviews = context.history.filter((entry) => entry.record.dailyOptions.A.kind === "review");
  if (!reviews.length) return true;
  return daysBetween(reviews[reviews.length - 1].date, context.dateKey) >= REVIEW_INTERVAL_DAYS;
}

/* ==========================================================
   A/B の生成（入口）
   ========================================================== */

function generateDailyOptions(data, dateKey) {
  const challenge = data.challenge;
  const history = getSeasonHistory(data, dateKey);
  const answered = history.filter((entry) => entry.record.resultStatus);
  const lastActiveDate = answered.length ? answered[answered.length - 1].date : null;
  const context = {
    data,
    dateKey,
    history,
    challenge,
    previous: getPreviousResult(history),
    lastAnswered: answered.length ? answered[answered.length - 1] : null,
    challengeDay: daysBetween(challenge.startDate, dateKey) + 1,
    isRestart: Boolean(lastActiveDate) && countMissedWeekdays(lastActiveDate, dateKey) >= RESTART_GAP_DAYS
  };

  const A = generateAreaOption(context);
  const bPlan = getItemMenuCandidates(context);
  const first = bPlan.queue[0];
  const B = generateItemOption(getItemById(first.id), first.size, first.miniLevel, first.lead);

  return { A, B, bQueue: bPlan.queue, bIndex: 0, bShown: [first.id] };
}

/* 土日は通常進行と分離した、1〜3分の補助タスクを出す */
function generateWeekendOptions(data, dateKey) {
  const challenge = data.challenge;
  const current = getCurrentArea(challenge)
    || [...challenge.areas].reverse().find((area) => area.status === "done")
    || challenge.areas[0];
  const normal = generateDailyOptions(data, dateKey);
  const item = getItemById(normal.B.itemId);
  const A = makeOption({
    slot: "A",
    kind: "weekend-mini",
    size: "mini",
    areaId: current ? current.id : "",
    areaName: current ? current.name : "",
    title: "重点エリアを少しだけ",
    headline: current
      ? `${quote(current.name)}から、戻せる物を1〜3個だけ戻そう。`
      : "目についた物を1〜3個だけ、元の場所に戻そう。",
    finish: "1つでも戻せたら今日は終了。",
    estimatedMinutes: 2,
    followUp: null
  });
  const B = generateItemOption(item, "mini", 1, "");
  B.title = "モノを3個だけ見る";
  B.headline = `${item.name}を3個だけ見てみよう。`;
  B.finish = "3個見たら今日は終了。";
  B.estimatedMinutes = 2;
  B.mini = null;
  return { A, B, bQueue: [], bIndex: 0, bShown: [item.id] };
}

/* 「別のモノにする」：候補を順番に進める */
function rotateItemMenu(record) {
  const queue = record.bQueue || [];
  if (!queue.length) return null;
  const nextIndex = ((record.bIndex || 0) + 1) % queue.length;
  const entry = queue[nextIndex];
  const option = generateItemOption(getItemById(entry.id), entry.size, entry.miniLevel, entry.lead);
  const shown = record.bShown || [];
  return {
    bIndex: nextIndex,
    B: option,
    bShown: shown.includes(entry.id) ? shown : [...shown, entry.id]
  };
}

function relativeDayWord(fromDate, toDate) {
  return daysBetween(fromDate, toDate) === 1 ? "昨日" : "前回";
}

/* ==========================================================
   A：今の場所を進める
   ========================================================== */

function generateAreaOption(context) {
  const { challenge, previous, dateKey } = context;
  const area = getCurrentArea(challenge);

  if (context.isRestart) {
    /* 前回の再開タスクをやれていたら、今回は場所の続きを小さく出す（再開ばかりにしない） */
    const lastAnswered = context.lastAnswered;
    const restartedBefore = lastAnswered && lastAnswered.record.selectedOption === "A"
      && lastAnswered.record.dailyOptions.A.kind === "restart"
      && (lastAnswered.record.resultStatus === "done" || lastAnswered.record.resultStatus === "partial");
    if (restartedBefore && area) {
      return buildStepOption(context, area, getNextStep(context.data, area), "smaller", { lead: "おかえりなさい。今日も少しだけ。" });
    }
    return buildRestartOption(context, area);
  }

  if (previous && area) {
    const prevOption = previous.option;
    const prevWord = relativeDayWord(previous.date, dateKey);
    const sameStep = prevOption.kind === "step" && prevOption.areaId === area.id && previous.slot === "A";

    if (previous.status === "not_done" && (previous.slot === "A" || !previous.selected)) {
      const level = sameStep && prevOption.size === "mini" ? (prevOption.miniLevel || 1) + 1 : 1;
      const step = sameStep ? prevOption.step : getNextStep(context.data, area);
      return buildStepOption(context, area, step, "mini", { miniLevel: level, lead: `${prevWord}はできなくても大丈夫。` });
    }
    if (previous.status === "not_done" && previous.slot === "B") {
      return buildStepOption(context, area, getNextStep(context.data, area), "mini", { miniLevel: countMiniOffers(context, area) % 2 + 1, lead: "今日は軽めでOK。" });
    }
    if (previous.slot === "A" && previous.status === "partial") {
      if (sameStep && prevOption.size === "mini") {
        return buildStepOption(context, area, prevOption.step, "mini", { miniLevel: (prevOption.miniLevel || 1) + 1, lead: "少しでも進めたら十分です。" });
      }
      if (sameStep && prevOption.size === "normal") {
        return buildStepOption(context, area, prevOption.step, "smaller", { lead: `${prevWord}の続きは、半分くらいで。` });
      }
      if (!sameStep && prevOption.kind !== "step") {
        return buildStepOption(context, area, getNextStep(context.data, area), "smaller", { lead: "今日も少しだけ。" });
      }
    }
    if (previous.slot === "A" && previous.status === "done" && sameStep && prevOption.size === "mini") {
      return buildStepOption(context, area, prevOption.step, "smaller", { lead: "少しずつ戻していこう。" });
    }
  }

  const dueArea = getDueMaintenanceArea(context.data, dateKey);
  if (dueArea) return buildMaintenanceOption(context, dueArea);
  if (isWeeklyReviewDue(context)) return generateWeeklyReview(context);
  if (!area) return buildKeepOption(context);
  return generateNextAreaInstruction(context, area);
}

/* 今の場所の次の段階。直前に場所が一区切りしていれば、ひとこと添える */
function generateNextAreaInstruction(context, area) {
  const step = getNextStep(context.data, area);
  const previous = context.previous;
  let lead = "";
  if (previous && previous.option.areaId && previous.option.areaId !== area.id) {
    const finished = getAreaById(context.challenge, previous.option.areaId);
    if (finished && finished.status === "done" && previous.option.kind === "step") {
      lead = `${quote(finished.name)}は、ひとまず一区切り。次は${quote(area.name)}です。`;
    }
  }
  return buildStepOption(context, area, step, "normal", { lead });
}

function countOffers(context, predicate) {
  return context.history.filter((entry) => predicate(entry.record.dailyOptions.A)).length;
}

function countMiniOffers(context, area) {
  return countOffers(context, (option) => option.areaId === area.id && option.size === "mini");
}

/* 前回表示した文（A と、実際に選んだ指示）とは違う言い方を選ぶ */
function getAvoidHeadlines(context) {
  const previous = context.previous;
  if (!previous) return [];
  const headlines = [previous.record.dailyOptions.A.headline];
  const selected = getSelectedEffectiveOption(previous.record);
  if (selected) headlines.push(selected.headline);
  return headlines;
}

function pickStepText(library, size, seed, miniLevel, avoid) {
  const count = library[size].length;
  for (let shift = 0; shift < count; shift += 1) {
    let text;
    if (size === "normal") text = library.normal[(seed + shift) % count];
    else if (size === "smaller") text = library.smaller[(seed + shift) % count];
    else text = library.mini[(miniLevel - 1 + shift) % count];
    if (!avoid.includes(text.headline) || shift === count - 1) {
      return { text, miniLevel: size === "mini" ? miniLevel + shift : 0 };
    }
  }
  return null;
}

function buildStepOption(context, area, step, size, options = {}) {
  const words = getStepWords(context.data, area);
  const library = getStepLibrary(step, words);
  const seed = countOffers(context, (option) => option.kind === "step" && option.areaId === area.id && option.step === step && option.size === size);
  const picked = pickStepText(library, size, seed, size === "mini" ? options.miniLevel || 1 : 0, getAvoidHeadlines(context));
  const text = picked.text;
  const miniLevel = picked.miniLevel;

  const followUp = text.followUp !== undefined ? text.followUp : library.followUp;
  const option = makeOption({
    slot: "A",
    kind: "step",
    step,
    size,
    miniLevel,
    areaId: area.id,
    areaName: area.name,
    title: TITLES.step,
    lead: [options.lead, text.lead].filter(Boolean).join(""),
    headline: text.headline,
    details: text.details || [],
    finish: text.finish,
    estimatedMinutes: size === "mini" ? 2 : text.minutes,
    followUp
  });

  const miniText = library.mini[size === "mini" ? miniLevel % library.mini.length : 0];
  option.mini = makeMini({
    miniLevel: size === "mini" ? miniLevel + 1 : 1,
    headline: miniText.headline,
    finish: miniText.finish,
    followUp: miniText.followUp !== undefined ? miniText.followUp : library.followUp
  });
  return option;
}

function buildRestartOption(context, area) {
  const target = area || [...context.challenge.areas].reverse().find((item) => item.status === "done") || context.challenge.areas[0];
  const seed = countOffers(context, (option) => option.kind === "restart");
  const text = pickVariant([
    { headline: `今日は3分だけ。今取り組んでいた${quote(target.name)}を見て、戻せる物を3つだけ戻そう。`, finish: "3つ戻したら今日は終了。" },
    { headline: `今日は3分だけ。${quote(target.name)}のゴミを3つだけ捨てよう。`, finish: "3つ捨てたら今日は終了。" }
  ], seed);
  const option = makeOption({
    slot: "A",
    kind: "restart",
    size: "normal",
    areaId: target.id,
    areaName: target.name,
    title: TITLES.restart,
    lead: "おかえりなさい。",
    headline: text.headline,
    finish: text.finish,
    estimatedMinutes: 3,
    followUp: null
  });
  option.mini = makeMini({ headline: `今日は2分だけ。${quote(target.name)}を眺めるだけでOK。`, finish: "眺めたら今日は終了。", followUp: null });
  return option;
}

function buildMaintenanceOption(context, area) {
  const seed = countOffers(context, (option) => option.kind === "maintenance");
  const text = pickVariant([
    { headline: `前に整えた${quote(area.name)}を3分だけ見てみよう。今も戻しやすい？`, finish: "出ている物を3つ戻したら今日は終了。" },
    { headline: `久しぶりに${quote(area.name)}をチェックしよう。出しっぱなしの物はない？`, finish: "3つ戻したら終了。片付いていたら、それで終了。" }
  ], seed);
  const option = makeOption({
    slot: "A",
    kind: "maintenance",
    size: "normal",
    areaId: area.id,
    areaName: area.name,
    title: TITLES.maintenance,
    headline: text.headline,
    finish: text.finish,
    estimatedMinutes: 3,
    followUp: { key: "messyItems", label: "また出しっぱなしになっていた物は？", type: "text" }
  });
  option.mini = makeMini({ headline: `今日は2分だけ。${quote(area.name)}を見に行くだけでOK。`, finish: "見たら今日は終了。", followUp: null });
  return option;
}

function generateWeeklyReview(context) {
  const seed = countOffers(context, (option) => option.kind === "review");
  const text = pickVariant([
    { lead: "今週もおつかれさまでした。", headline: "今週、一番変わった場所を1分だけ見てみよう。", finish: "見たら今日は終了。" },
    { headline: "今週片付けた場所を1つ見てみよう。前より戻しやすくなっている？", finish: "見るだけで今日は終了。" },
    { headline: "この1週間で、探し物は減った？ 家の中を少しだけ見て回ろう。", finish: "見て回ったら今日は終了。" },
    { headline: "片付けた場所で、また散らかりやすい所を1つ見てみよう。", details: ["今日は直さなくてOK。"], finish: "見たら今日は終了。" }
  ], seed);
  const area = getCurrentArea(context.challenge);
  const followUp = { key: "weeklyChange", label: "今週、一番変わったことは？", type: "choice", choices: WEEKLY_CHANGE_CHOICES };
  const option = makeOption({
    slot: "A",
    kind: "review",
    size: "normal",
    areaId: area ? area.id : "",
    areaName: area ? area.name : "",
    title: TITLES.review,
    lead: text.lead || "",
    headline: text.headline,
    details: text.details || [],
    finish: text.finish,
    estimatedMinutes: 3,
    followUp
  });
  option.mini = makeMini({ headline: "今日は2分だけ。今週、少しラクになったことを1つ思い浮かべよう。", finish: "思い浮かべるだけでOK。", followUp });
  return option;
}

function getAllDoneLead(challenge) {
  if (challenge.areas.length < MAX_AREAS) {
    return "重点エリアはすべて一区切りしました。場所を増やしたいときは「3か月」画面から追加できます。";
  }
  return "重点エリアはすべて一区切りしました。ここからは、散らかっても戻せる状態をキープしていきます。";
}

/* 重点エリアがすべて一区切りしたあと */
function buildKeepOption(context) {
  const doneAreas = context.challenge.areas.filter((area) => area.status === "done");
  const seed = countOffers(context, (option) => option.kind === "keep");
  const area = pickVariant(doneAreas, seed);
  const firstTime = seed === 0;
  const text = pickVariant([
    { headline: `${quote(area.name)}で出ている物を3つ、決めた場所に戻そう。`, finish: "3つ戻したら今日は終了。" },
    { headline: `${quote(area.name)}を3分だけ見て、置きっぱなしの物を1つ戻そう。`, finish: "1つ戻したら今日は終了。" },
    { headline: `${quote(area.name)}のゴミを3つだけ捨てよう。`, finish: "3つ捨てたら今日は終了。" }
  ], seed);
  const option = makeOption({
    slot: "A",
    kind: "keep",
    size: "normal",
    areaId: area.id,
    areaName: area.name,
    title: TITLES.keep,
    lead: firstTime ? getAllDoneLead(context.challenge) : "",
    headline: text.headline,
    finish: text.finish,
    estimatedMinutes: 3,
    followUp: null
  });
  option.mini = makeMini({ headline: `今日は2分だけ。${quote(area.name)}を眺めるだけでOK。`, finish: "眺めたら今日は終了。", followUp: null });
  return option;
}

/* ==========================================================
   B：モノ別5分
   ========================================================== */

function hashSeed(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1000003;
  }
  return hash;
}

function getRecentItemIds(context) {
  const ids = new Set();
  context.history.forEach(({ date, record }) => {
    if (daysBetween(date, context.dateKey) >= ITEM_REPEAT_DAYS) return;
    (record.bShown || [record.dailyOptions.B.itemId]).forEach((id) => ids.add(id));
  });
  return ids;
}

function getUserWords(context) {
  const words = context.challenge.areas.map((area) => area.name);
  context.challenge.areas.forEach((area) => {
    const memory = getAreaMemory(context.data, area.id);
    ["mostItem", "remaining", "cause"].forEach((key) => {
      if (memory[key]) words.push(memory[key]);
    });
  });
  return words.join(" ");
}

/* 最近出したモノを避け、「物が多い」なら減らしやすいモノ、回答に出てきたモノを優先する */
function getItemMenuCandidates(context) {
  const { previous, challenge } = context;
  const recent = getRecentItemIds(context);
  const userWords = getUserWords(context);
  const prevItem = previous ? getItemById(previous.record.dailyOptions.B.itemId) : null;

  const scored = ITEM_MENU.map((item) => {
    let score = hashSeed(`${context.dateKey}:${item.id}`) % 100;
    if (recent.has(item.id)) score -= 1000;
    if (challenge.primaryProblem === "too_much" && item.reduce) score += 30;
    if (item.keywords.some((word) => userWords.includes(word))) score += 60;
    if (prevItem && item.category === prevItem.category) score -= 50;
    return { item, score };
  }).sort((a, b) => b.score - a.score);

  /* 前回の結果に合わせて大きさを決める */
  let size = "normal";
  let first = null;
  const lowEnergy = context.isRestart || (previous && previous.status === "not_done");
  if (lowEnergy) size = "mini";

  if (previous && previous.slot === "B" && previous.selected && !context.isRestart) {
    const prevOption = previous.option;
    const prevWord = relativeDayWord(previous.date, context.dateKey);
    if (previous.status === "partial" && prevOption.size === "normal") {
      first = { id: prevOption.itemId, size: "smaller", miniLevel: 0, lead: `${prevWord}の続きを少しだけ。` };
    } else if (previous.status === "partial" && prevOption.size === "mini") {
      first = { id: prevOption.itemId, size: "mini", miniLevel: (prevOption.miniLevel || 1) + 1, lead: "少しでも進めたら十分です。" };
    } else if (previous.status === "not_done") {
      const level = prevOption.size === "mini" ? (prevOption.miniLevel || 1) + 1 : 1;
      first = { id: prevOption.itemId, size: "mini", miniLevel: level, lead: `${prevWord}はできなくても大丈夫。` };
    }
  }

  const queue = [];
  if (first) queue.push(first);
  scored.forEach(({ item }) => {
    if (queue.length >= B_QUEUE_SIZE || queue.some((entry) => entry.id === item.id)) return;
    queue.push({ id: item.id, size, miniLevel: size === "mini" ? 1 : 0, lead: "" });
  });
  return { queue };
}

/* 「種類」「か所」などは「1つ」と数える */
function countWithUnit(item, count) {
  const unit = ["種類", "か所", "セット"].includes(item.unit) ? "つ" : item.unit;
  return `${count}${unit}`;
}

function generateItemOption(item, size, miniLevel, lead) {
  const n = item.n;
  const smallN = Math.max(1, Math.ceil(n / 2));
  let headline;
  let finish;
  let minutes;

  if (size === "smaller") {
    headline = item.smaller || fillCount(item.instruction, smallN);
    finish = item.smaller ? "できたら今日は終了。" : fillCount(item.finishCondition, smallN);
    minutes = 3;
  } else if (size === "mini") {
    const level = miniLevel || 1;
    headline = level % 2 === 1
      ? `今日は2分だけ。${item.name}を${countWithUnit(item, Math.min(3, n))}だけ見てみよう。`
      : `今日は2分だけ。${item.name}がどこにあるか、確かめるだけでOK。`;
    finish = "見るだけでOK。";
    minutes = 2;
  } else {
    headline = fillCount(item.instruction, n);
    finish = fillCount(item.finishCondition, n);
    minutes = item.minutes;
  }

  const option = makeOption({
    slot: "B",
    kind: "item",
    size,
    miniLevel: size === "mini" ? miniLevel || 1 : 0,
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    title: TITLES.item[size],
    lead: `${lead || ""}今日は${CATEGORY_LABELS[item.category]}。`,
    headline,
    finish,
    estimatedMinutes: minutes,
    followUp: null
  });
  const nextLevel = size === "mini" ? (miniLevel || 1) + 1 : 1;
  option.mini = makeMini({
    miniLevel: nextLevel,
    headline: nextLevel % 2 === 1
      ? `今日は2分だけ。${item.name}を${countWithUnit(item, 1)}だけ見てみよう。`
      : `今日は2分だけ。${item.name}がどこにあるか、確かめるだけでOK。`,
    finish: "見るだけでOK。",
    followUp: null
  });
  return option;
}

/* ==========================================================
   共通の形
   ========================================================== */

function makeOption(fields) {
  return {
    slot: fields.slot,
    kind: fields.kind,
    step: fields.step || "",
    size: fields.size || "normal",
    miniLevel: fields.miniLevel || 0,
    areaId: fields.areaId || "",
    areaName: fields.areaName || "",
    itemId: fields.itemId || "",
    itemName: fields.itemName || "",
    category: fields.category || "",
    title: fields.title,
    lead: fields.lead || "",
    headline: fields.headline,
    details: fields.details || [],
    finish: fields.finish || "",
    estimatedMinutes: fields.estimatedMinutes,
    followUp: fields.followUp || null,
    mini: null
  };
}

/* 「今日はちょっと無理」で表示する小さい版 */
function makeMini(fields) {
  return {
    size: "mini",
    miniLevel: fields.miniLevel || 1,
    lead: "今日は無理しなくて大丈夫。",
    headline: fields.headline,
    details: [],
    finish: fields.finish,
    estimatedMinutes: 2,
    followUp: fields.followUp || null
  };
}

function optionToText(option) {
  return [option.lead, option.headline, ...option.details, option.finish].filter(Boolean).join("\n");
}
