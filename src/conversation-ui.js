import { Conversation } from "./conversation.js";
import { corpus } from "./beta-search.js";
import "./conversation.css";
const $ = (id) => document.getElementById(id),
  node = (tag, text) => {
    const n = document.createElement(tag);
    n.textContent = text;
    return n;
  };
// Original fields are rendered as text; neither source content nor user input is HTML.
export function renderSource(entry, parent, { expand = false } = {}) {
  const card = node("article", "");
  card.className = "entry";
  card.dataset.sourceId = entry.id;
  card.append(
    node("span", entry.category + " / " + entry.id),
    node("h3", entry.title),
    node("p", entry.summary),
  );
  const warning = node("div", "");
  warning.className = "warning";
  warning.append(node("h4", "注意事項"), node("p", entry.warning));
  card.append(warning);
  const details = node("details", "");
  details.open = expand;
  details.append(node("summary", "原文・手順と出典を読む"));
  const steps = node("ol", "");
  entry.steps.forEach((s) => steps.append(node("li", s)));
  details.append(
    node("h4", "手順（原文・省略なし）"),
    steps,
    node("h4", "準備するもの"),
    node("p", entry.items),
    node("h4", "出典（外部サイト）"),
  );
  for (const s of entry.sources) {
    const a = node("a", s.label);
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    details.append(a, node("br", ""));
  }
  card.append(details);
  parent.append(card);
}
export function mountConversation(controller) {
  const panel = $("conversation"),
    log = $("conversationLog"),
    input = $("chatQuestion"),
    form = $("chatForm"),
    status = $("chatStatus"),
    send = $("chatSend"),
    stop = $("chatStop"),
    voiceLab = document.querySelector(".voice-lab");
  try {
    const draft = sessionStorage.getItem("bosai-voice-draft");
    if (draft !== null) {
      input.value = draft;
      sessionStorage.removeItem("bosai-voice-draft");
    }
  } catch {}
  const engine = new Conversation((q, m, request) =>
    controller.search(q, m, request),
  );
  let epoch = 0,
    activeView = "chat";
  const voiceActive = () => voiceLab.dataset.active === "true";
  const menu = $("menuToggle"),
    navigation = $("appNavigation");
  menu.onclick = () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("open", open);
  };
  const titles = { chat: "会話する", dictionary: "防災辞書", settings: "設定" };
  function showView(next) {
    activeView = next;
    panel.hidden = next !== "chat";
    $("dictionary").hidden = next !== "dictionary";
    $("appSettings").hidden = next !== "settings";
    $("viewTitle").textContent = titles[next];
    $("chatClear").hidden = next !== "chat";
    for (const button of navigation.querySelectorAll("[data-view]"))
      button.setAttribute(
        "aria-current",
        button.dataset.view === next ? "page" : "false",
      );
    menu.setAttribute("aria-expanded", "false");
    navigation.classList.remove("open");
    // Switching views does not cancel a running turn, drop the draft or alter the microphone target.
    $("main").scrollTop = 0;
    $("viewTitle").setAttribute("tabindex", "-1");
    $("viewTitle").focus({ preventScroll: true });
  }
  for (const button of navigation.querySelectorAll("[data-view]"))
    button.onclick = () => showView(button.dataset.view);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      navigation.classList.remove("open");
      menu.setAttribute("aria-expanded", "false");
      $("voicePopover").hidden = true;
      $("voiceToggle").setAttribute("aria-expanded", "false");
    }
  });
  function voiceOpen(open) {
    $("voicePopover").hidden = !open;
    $("voiceToggle").setAttribute("aria-expanded", String(open));
  }
  $("voiceToggle").onclick = () => voiceOpen($("voicePopover").hidden);
  $("voiceClose").onclick = () => voiceOpen(false);
  // Detailed experiments belong in settings, not in the everyday voice composer.
  for (const detail of voiceLab.querySelectorAll("details"))
    $("voiceExperiments").append(detail);
  const theme = $("theme");
  function applyTheme() {
    document.documentElement.dataset.theme = theme.value;
    try {
      localStorage.setItem("bosai-theme", theme.value);
    } catch {}
  }
  try {
    theme.value = localStorage.getItem("bosai-theme") || "system";
  } catch {}
  theme.onchange = applyTheme;
  applyTheme();
  const category = $("browseCategory"),
    query = $("browseQuery"),
    list = $("browseList"),
    article = $("browseArticle");
  for (const name of [...new Set(corpus.map((e) => e.category))]) {
    const o = node("option", name);
    o.value = name;
    category.append(o);
  }
  let selectedId = null;
  function openEntry(entry) {
    selectedId = entry.id;
    article.replaceChildren();
    renderSource(entry, article, { expand: true });
    for (const b of list.querySelectorAll("button"))
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.browseEntry === entry.id),
      );
    if (matchMedia("(max-width:700px)").matches)
      article.scrollIntoView({ block: "start" });
  }
  function browse() {
    const q = query.value.normalize("NFKC").toLowerCase().trim();
    const matches = corpus.filter(
      (e) =>
        (!category.value || e.category === category.value) &&
        (!q ||
          [
            e.title,
            e.summary,
            e.warning,
            e.items,
            ...e.steps,
            ...e.sources.map((s) => s.label),
          ]
            .join(" ")
            .normalize("NFKC")
            .toLowerCase()
            .includes(q)),
    );
    $("browseCount").textContent = `${matches.length} / 88件`;
    list.replaceChildren();
    for (const e of matches) {
      const b = node("button", "");
      b.type = "button";
      b.dataset.browseEntry = e.id;
      b.setAttribute("aria-pressed", String(e.id === selectedId));
      b.append(
        node("small", e.category),
        node("strong", e.title),
        node("span", "原文を読む →"),
      );
      b.onclick = () => openEntry(e);
      list.append(b);
    }
    if (!matches.length)
      list.append(
        node("p", "一致する記事がありません。別の言葉をお試しください。"),
      );
  }
  query.oninput = browse;
  category.onchange = browse;
  browse();
  for (const text of [
    "寝ているときに地震が来たら？",
    "津波から高台に逃げられないときは？",
    "避難所で水が使えないときのトイレは？",
  ]) {
    const b = node("button", text + " ↗");
    b.type = "button";
    b.onclick = () => {
      input.value = text;
      form.requestSubmit();
    };
    $("chatExamples").append(b);
  }
  function sync() {
    const busy = engine.busy;
    send.hidden = busy;
    stop.hidden = !busy;
    stop.disabled = !busy;
    send.disabled = voiceActive() || controller.busy;
    $("chatCount").textContent = `${input.value.length} / 200`;
  }
  document.addEventListener("bosai:state", sync);
  input.addEventListener("input", sync);
  function render() {
    const scroller = log.parentNode,
      nearBottom =
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <
        140,
      top = scroller.scrollTop;
    log.replaceChildren();
    $("chatWelcome").hidden = engine.history.length > 0;
    for (const message of engine.history) {
      const bubble = node("div", "");
      bubble.className = `bubble ${message.role}`;
      bubble.append(
        node("strong", message.role === "user" ? "あなた" : "bosai AI"),
        node("p", message.text),
      );
      if (message.role === "assistant") {
        const candidates = node("div", "");
        candidates.className = "candidate-list";
        for (const c of message.candidates || []) {
          const fit =
            {
              candidate: "適用候補・安全性未確認",
              "needs-confirmation": "適用条件は要確認",
              "not-applicable": "適用外",
            }[c.applicability?.status] || "関連情報・適用未確認";
          const b = node("button", "");
          b.type = "button";
          b.dataset.sourceChoice = c.id;
          b.append(
            node("small", c.category + " · " + fit),
            node("span", c.title + " →"),
          );
          b.disabled =
            message.selection !== engine.state.selection ||
            !engine.state.pending.includes(c.id) ||
            engine.busy;
          b.onclick = () => {
            try {
              engine.choose(c.id, message.selection);
              render();
            } catch (e) {
              status.textContent = e.message;
            }
          };
          candidates.append(b);
        }
        bubble.append(candidates);
        for (const c of message.choices || []) {
          const b = node("button", c);
          b.className = "choice";
          b.type = "button";
          b.disabled = message !== engine.history.at(-1) || engine.busy;
          b.onclick = () => {
            input.value = c;
            form.requestSubmit();
          };
          bubble.append(b);
        }
        for (const e of message.entries || []) renderSource(e, bubble);
        if (message.entries)
          for (const text of ["もっと詳しく", "ほかの状況なら？"]) {
            const b = node("button", text);
            b.className = "choice";
            b.type = "button";
            b.disabled = message !== engine.history.at(-1) || engine.busy;
            b.onclick = () => {
              input.value = text;
              form.requestSubmit();
            };
            bubble.append(b);
          }
      }
      log.append(bubble);
    }
    sync();
    if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
    else scroller.scrollTop = top;
    panel.dataset.state = JSON.stringify({
      history: engine.history.map(({ entries, ...m }) => ({
        ...m,
        entryIds: entries?.map((e) => e.id),
      })),
      state: engine.state,
    });
  }
  stop.onclick = () => {
    epoch++;
    controller.stop();
    engine.cancel();
    status.textContent = "検索を停止しました。入力と履歴は残しています。";
    render();
  };
  $("chatClear").onclick = () => {
    if (voiceActive()) {
      voiceOpen(true);
      status.textContent =
        "録音・音声モデルを終了してから新しい会話を始めてください。";
      return;
    }
    epoch++;
    if (engine.busy) controller.stop();
    engine.clear();
    status.textContent = "新しい会話を始めました。";
    render();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (engine.busy) return;
    if (voiceActive()) {
      voiceOpen(true);
      status.textContent =
        "音声入力の停止・モデル解放後に、認識結果を確認して送信してください。";
      return;
    }
    if (controller.busy) {
      status.textContent = "モデルの処理が終わってから送信してください。";
      return;
    }
    const text = input.value.trim();
    if (!text) return;
    const seq = ++epoch;
    status.textContent = "辞書を検索し、条件を確認しています…";
    status.setAttribute("aria-busy", "true");
    try {
      const pending = engine.send(text, $("mode").value);
      render();
      await pending;
      if (seq === epoch) {
        input.value = "";
        status.textContent = "";
        render();
      }
    } catch (e) {
      if (seq === epoch) {
        status.textContent =
          e.message + "。入力を残しました。もう一度送信できます。";
        render();
      }
    } finally {
      if (seq === epoch) status.removeAttribute("aria-busy");
      sync();
    }
  };
  // Enter adds a line on touch devices; explicit Cmd/Ctrl+Enter sends without interfering with IME.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  const viewport = window.visualViewport;
  const resize = () => {
    document.documentElement.style.setProperty(
      "--app-height",
      `${viewport?.height || innerHeight}px`,
    );
    document.documentElement.style.setProperty(
      "--viewport-top",
      `${viewport?.offsetTop || 0}px`,
    );
  };
  viewport?.addEventListener("resize", resize);
  viewport?.addEventListener("scroll", resize);
  resize();
  if (["localhost", "127.0.0.1"].includes(location.hostname))
    Object.defineProperty(window, "bosaiConversation", { value: engine });
  render();
}
