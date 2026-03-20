// Phronesis AI Chat Widget
// Replace WORKER_URL with your deployed Cloudflare Worker URL

const WORKER_URL = "https://phronesis.sclanga315.workers.dev";
cd ~/Desktop/Phronesis
git add worker.js
git commit -m "Fix CORS to allow all origins"
git push
const SUGGESTIONS = [
  "What has Phronesis published on AI governance?",
  "Where can I find legal analysis?",
  "What are the recent policy proposals?",
  "Tell me about Phronesis",
];

(function () {
  // ── Build DOM ─────────────────────────────────────────────
  const trigger = document.createElement("button");
  trigger.id = "ph-chat-trigger";
  trigger.setAttribute("aria-label", "Open research assistant");
  trigger.innerHTML = `
    <svg class="ph-open-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    <svg class="ph-close-icon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
  `;

  const panel = document.createElement("div");
  panel.id = "ph-chat-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Phronesis research assistant");
  panel.innerHTML = `
    <div class="ph-panel-header">
      <div class="ph-panel-header-left">
        <div class="ph-panel-dot"></div>
        <div>
          <div class="ph-panel-title">Phronesis Assistant</div>
          <div class="ph-panel-subtitle">Ask about our research</div>
        </div>
      </div>
    </div>
    <div class="ph-messages" id="ph-messages"></div>
    <div class="ph-suggestions" id="ph-suggestions"></div>
    <div class="ph-input-row">
      <input type="text" id="ph-input" placeholder="Ask a question..." autocomplete="off" />
      <button id="ph-send" aria-label="Send">
        <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
    <div class="ph-disclaimer">Powered by Claude · Responses may not reflect unpublished work</div>
  `;

  document.body.appendChild(trigger);
  document.body.appendChild(panel);

  // ── State ─────────────────────────────────────────────────
  const messagesEl = document.getElementById("ph-messages");
  const inputEl    = document.getElementById("ph-input");
  const sendBtn    = document.getElementById("ph-send");
  const suggsEl    = document.getElementById("ph-suggestions");
  const history    = [];
  let isOpen = false;
  let isLoading = false;

  // ── Suggestions ───────────────────────────────────────────
  SUGGESTIONS.forEach(text => {
    const btn = document.createElement("button");
    btn.className = "ph-suggestion";
    btn.textContent = text;
    btn.addEventListener("click", () => {
      inputEl.value = text;
      sendMessage();
      suggsEl.style.display = "none";
    });
    suggsEl.appendChild(btn);
  });

  // ── Greeting ──────────────────────────────────────────────
  function addGreeting() {
    appendMessage("assistant", "Hello. I can help you navigate Phronesis — find publications, understand our scope, or point you to specific research. What are you looking for?");
  }

  // ── Toggle ────────────────────────────────────────────────
  trigger.addEventListener("click", () => {
    isOpen = !isOpen;
    trigger.classList.toggle("open", isOpen);
    panel.classList.toggle("open", isOpen);
    if (isOpen && messagesEl.children.length === 0) {
      addGreeting();
    }
    if (isOpen) inputEl.focus();
  });

  // ── Append message ────────────────────────────────────────
  function appendMessage(role, text) {
    const msg = document.createElement("div");
    msg.className = `ph-msg ${role}`;

    const label = document.createElement("div");
    label.className = "ph-msg-label";
    label.textContent = role === "user" ? "You" : "Phronesis";

    const bubble = document.createElement("div");
    bubble.className = "ph-msg-bubble";
    bubble.textContent = text;

    msg.appendChild(label);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  // ── Typing indicator ──────────────────────────────────────
  function showTyping() {
    const msg = document.createElement("div");
    msg.className = "ph-msg assistant ph-typing";
    msg.id = "ph-typing";
    msg.innerHTML = `
      <div class="ph-msg-label">Phronesis</div>
      <div class="ph-msg-bubble">
        <div class="ph-typing-dot"></div>
        <div class="ph-typing-dot"></div>
        <div class="ph-typing-dot"></div>
      </div>
    `;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById("ph-typing");
    if (el) el.remove();
  }

  // ── Send message ──────────────────────────────────────────
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isLoading) return;

    inputEl.value = "";
    isLoading = true;
    sendBtn.disabled = true;
    suggsEl.style.display = "none";

    appendMessage("user", text);
    history.push({ role: "user", content: text });
    showTyping();

    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json();
      removeTyping();
      appendMessage("assistant", data.reply);
      history.push({ role: "assistant", content: data.reply });
    } catch {
      removeTyping();
      appendMessage("assistant", "I'm having trouble connecting right now. Please try again in a moment.");
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ── Close on outside click ────────────────────────────────
  document.addEventListener("click", e => {
    if (isOpen && !panel.contains(e.target) && !trigger.contains(e.target)) {
      isOpen = false;
      trigger.classList.remove("open");
      panel.classList.remove("open");
    }
  });
})();
