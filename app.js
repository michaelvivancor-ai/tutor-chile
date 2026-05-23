/* ── TutorChile — Frontend ── */

const $ = (sel) => document.querySelector(sel);

const chatArea      = $("#chat-area");
const messagesEl    = $("#messages");
const welcomeScreen = $("#welcome-screen");
const userInput     = $("#user-input");
const btnSend       = $("#btn-send");
const btnNewChat    = $("#btn-new-chat");
const btnMenu       = $("#btn-menu");
const sidebar       = $("#sidebar");
const overlay       = $("#overlay");

let conversationHistory = [];
let isStreaming = false;

// ── Auto-resize del textarea ──
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + "px";
});

// ── Enviar con Enter (Shift+Enter = nueva línea) ──
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!isStreaming) sendMessage();
  }
});

btnSend.addEventListener("click", () => { if (!isStreaming) sendMessage(); });

// ── Botones de tema rápido ──
document.querySelectorAll(".topic-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const topic = btn.dataset.topic;
    userInput.value = topic;
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 160) + "px";
    if (window.innerWidth <= 768) closeSidebar();
    userInput.focus();
    sendMessage();
  });
});

// ── Nueva conversación ──
btnNewChat.addEventListener("click", resetChat);

// ── Sidebar mobile ──
btnMenu.addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.add("show");
});

overlay.addEventListener("click", closeSidebar);

function closeSidebar() {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
}

// ── FUNCIONES PRINCIPALES ──

function resetChat() {
  conversationHistory = [];
  messagesEl.innerHTML = "";
  welcomeScreen.style.display = "flex";
  userInput.value = "";
  userInput.style.height = "auto";
  userInput.focus();
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  // Ocultar pantalla de bienvenida
  welcomeScreen.style.display = "none";

  // Limpiar input
  userInput.value = "";
  userInput.style.height = "auto";

  // Agregar mensaje del usuario
  conversationHistory.push({ role: "user", content: text });
  appendMessage("user", text);

  // Iniciar streaming
  setStreaming(true);
  const assistantBubble = appendMessage("assistant", null); // null = modo streaming

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // guardar línea incompleta

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        let parsed;
        try { parsed = JSON.parse(raw); } catch { continue; }

        if (parsed.text) {
          fullText += parsed.text;
          updateBubble(assistantBubble, fullText, true);
        }

        if (parsed.done) {
          updateBubble(assistantBubble, fullText, false);
          conversationHistory.push({ role: "assistant", content: fullText });
        }

        if (parsed.error) {
          updateBubble(assistantBubble, `⚠️ ${parsed.error}`, false);
        }
      }
    }

    // Si el stream terminó sin evento "done"
    if (fullText && !assistantBubble.dataset.finalized) {
      updateBubble(assistantBubble, fullText, false);
      if (!conversationHistory.find(m => m.role === "assistant" && m.content === fullText)) {
        conversationHistory.push({ role: "assistant", content: fullText });
      }
    }

  } catch (err) {
    console.error("Error:", err);
    updateBubble(
      assistantBubble,
      "Lo siento, hubo un problema al procesar tu consulta. Por favor, inténtalo de nuevo.",
      false
    );
  } finally {
    setStreaming(false);
    scrollToBottom();
  }
}

// ── Añadir mensaje al DOM ──
function appendMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;

  const avatarEl = document.createElement("div");
  avatarEl.className = "message-avatar";
  avatarEl.textContent = role === "user" ? "TÚ" : "🇨🇱";

  const bodyEl = document.createElement("div");
  bodyEl.className = "message-body";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (text === null) {
    // Mostrar indicador de carga mientras se espera el primer token
    bubble.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    bubble.classList.add("typing-cursor");
  } else {
    bubble.innerHTML = renderMarkdown(text);
  }

  bodyEl.appendChild(bubble);

  if (role === "user") {
    wrap.appendChild(bodyEl);
    wrap.appendChild(avatarEl);
  } else {
    wrap.appendChild(avatarEl);
    wrap.appendChild(bodyEl);
  }

  messagesEl.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

// ── Actualizar burbuja en tiempo real ──
function updateBubble(bubble, text, streaming) {
  bubble.innerHTML = renderMarkdown(text);
  if (streaming) {
    bubble.classList.add("typing-cursor");
  } else {
    bubble.classList.remove("typing-cursor");
    bubble.dataset.finalized = "1";
  }
  scrollToBottom();
}

// ── Scroll al fondo ──
function scrollToBottom() {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: "smooth" });
}

// ── Estado de streaming ──
function setStreaming(active) {
  isStreaming = active;
  btnSend.disabled = active;
  userInput.disabled = active;
}

// ── Renderizar Markdown básico ──
function renderMarkdown(text) {
  if (!text) return "";

  let html = escapeHtml(text);

  // Bloques de código (```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );

  // Código inline
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Encabezados
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Negrita e itálica
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Citas
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // Listas no ordenadas
  html = html.replace(/^[\s]*[-*+] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, (match) => `<ul>${match}</ul>`);

  // Listas ordenadas
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );

  // URLs sueltas
  html = html.replace(
    /(?<!["\(])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );

  // Saltos de párrafo (doble newline)
  html = html.replace(/\n{2,}/g, "</p><p>");

  // Saltos de línea simples
  html = html.replace(/\n/g, "<br>");

  // Envolver en párrafo si no empieza con bloque
  if (!html.startsWith("<h") && !html.startsWith("<ul") && !html.startsWith("<ol") && !html.startsWith("<pre") && !html.startsWith("<blockquote")) {
    html = `<p>${html}</p>`;
  }

  // Limpiar <ul> anidados duplicados
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  return html;
}

// ── Escapar HTML para prevenir XSS ──
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Inicializar ──
userInput.focus();
