(function () {
  "use strict";

  if (window.__ECMT_WEBSITE_WIDGET__) return;
  window.__ECMT_WEBSITE_WIDGET__ = true;

  var script = document.currentScript;
  if (!script) {
    script = document.querySelector('script[src*="/widget.js"][data-widget-key]');
  }
  if (!script) {
    var scripts = document.getElementsByTagName("script");
    script = scripts[scripts.length - 1];
  }

  var publicKey = script.getAttribute("data-widget-key");
  if (!publicKey) {
    console.error("[ECMT Widget] Missing data-widget-key.");
    return;
  }

  var crmOrigin = new URL(script.src, window.location.href).origin;
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var label = script.getAttribute("data-label") || "Talk with ESRA";
  var nudgeDelayMs = Math.max(
    0,
    Number(script.getAttribute("data-nudge-delay") || "60") * 1000
  );
  var autoOpenOnNudge = script.getAttribute("data-auto-open") === "true";
  var nudgeText =
    script.getAttribute("data-nudge-text") || "Need help with courses or admissions?";
  var opened = false;
  var loaded = false;
  var nudged = false;
  var nudgeTimer = null;
  var session = null;
  var storageKey = "ecmt_widget_session_" + crmOrigin + "_" + publicKey;
  var nudgeSeenKey = "ecmt_widget_nudge_seen_" + crmOrigin + "_" + publicKey;

  try {
    var savedSession = window.localStorage.getItem(storageKey);
    if (savedSession) {
      var parsedSession = JSON.parse(savedSession);
      if (parsedSession.conversationId && parsedSession.token) session = parsedSession;
    }
  } catch (_) {
    // Storage can be disabled by the host page's privacy settings.
  }

  var ICON_CHAT =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  var style = document.createElement("style");
  style.textContent =
    ".ecmt-chat-launcher{position:fixed;z-index:2147483646;bottom:20px;" +
    position +
    ":20px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:60px;height:60px;" +
    "max-width:calc(100% - 40px);" +
    "border:0;border-radius:999px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;" +
    "box-shadow:0 12px 30px rgba(37,99,235,.4);cursor:pointer;padding:0;" +
    "transition:transform .18s ease,box-shadow .18s ease}" +
    ".ecmt-chat-launcher:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 16px 36px rgba(37,99,235,.48)}" +
    ".ecmt-chat-launcher:disabled{opacity:.7;cursor:default}" +
    ".ecmt-chat-launcher svg{display:block}" +
    ".ecmt-chat-launcher.ecmt-chat-pulse{animation:ecmt-chat-pulse 1.6s ease-in-out infinite}" +
    "@keyframes ecmt-chat-pulse{0%,100%{box-shadow:0 12px 30px rgba(37,99,235,.4),0 0 0 0 rgba(37,99,235,.45)}" +
    "70%{box-shadow:0 12px 30px rgba(37,99,235,.4),0 0 0 16px rgba(37,99,235,0)}}" +
    ".ecmt-chat-nudge{position:fixed;z-index:2147483646;bottom:92px;" +
    position +
    ":20px;box-sizing:border-box;max-width:min(260px,calc(100% - 40px));padding:12px 14px;border-radius:14px;" +
    "background:#fff;color:#0f172a;font:600 13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
    "box-shadow:0 14px 40px rgba(15,23,42,.18);display:none;cursor:pointer}" +
    ".ecmt-chat-nudge::after{content:'';position:absolute;bottom:-7px;" +
    position +
    ":22px;width:14px;height:14px;background:#fff;transform:rotate(45deg);" +
    "box-shadow:4px 4px 8px rgba(15,23,42,.06)}" +
    ".ecmt-chat-frame{position:fixed;z-index:2147483647;bottom:92px;" +
    position +
    ":20px;box-sizing:border-box;width:min(390px,calc(100% - 32px));width:min(390px,calc(100dvw - 32px));" +
    "height:min(620px,calc(100% - 130px));height:min(620px,calc(100dvh - 130px));" +
    "border:0;border-radius:16px;box-shadow:0 18px 60px rgba(15,23,42,.28);background:#fff;display:none;overflow:hidden}" +
    "@media (max-width:480px){.ecmt-chat-frame{top:0;right:0;bottom:0;left:0;width:100%;height:100%;height:100dvh;" +
    "max-width:none;max-height:none;border-radius:0;box-shadow:none}}";
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "ecmt-chat-launcher";
  launcher.innerHTML = ICON_CHAT;
  launcher.setAttribute("aria-label", label);

  var nudge = document.createElement("button");
  nudge.type = "button";
  nudge.className = "ecmt-chat-nudge";
  nudge.textContent = nudgeText;
  nudge.setAttribute("aria-label", nudgeText);

  var frame = document.createElement("iframe");
  frame.className = "ecmt-chat-frame";
  frame.title = "Admissions Assistant";
  frame.setAttribute("allow", "clipboard-write");
  frame.src = crmOrigin + "/widget";

  function markNudgeSeen() {
    try {
      window.sessionStorage.setItem(nudgeSeenKey, "1");
    } catch (_) {
      // sessionStorage may be unavailable.
    }
  }

  function clearNudge() {
    if (nudgeTimer) {
      window.clearTimeout(nudgeTimer);
      nudgeTimer = null;
    }
    nudged = true;
    launcher.classList.remove("ecmt-chat-pulse");
    nudge.style.display = "none";
    markNudgeSeen();
  }

  function openChat() {
    if (opened) return;
    opened = true;
    clearNudge();
    frame.style.display = "block";
    launcher.innerHTML = ICON_CLOSE;
    launcher.setAttribute("aria-label", "Close chat");
    startSession();
  }

  function closeChat() {
    if (!opened) return;
    opened = false;
    frame.style.display = "none";
    launcher.innerHTML = ICON_CHAT;
    launcher.setAttribute("aria-label", label);
    clearNudge();
  }

  function showNudge() {
    if (opened || nudged) return;
    nudged = true;
    markNudgeSeen();
    if (autoOpenOnNudge) {
      openChat();
      return;
    }
    launcher.classList.add("ecmt-chat-pulse");
    nudge.style.display = "block";
  }

  function scheduleNudge() {
    if (!nudgeDelayMs || opened) return;
    try {
      if (window.sessionStorage.getItem(nudgeSeenKey) === "1") return;
    } catch (_) {
      // Continue; nudge still works without sessionStorage.
    }
    nudgeTimer = window.setTimeout(showNudge, nudgeDelayMs);
  }

  function postSession() {
    if (!session || !loaded) return;
    frame.contentWindow.postMessage(
      { type: "ecmt-widget-session", session: session },
      crmOrigin
    );
  }

  function startSession() {
    if (session) {
      postSession();
      return;
    }

    launcher.disabled = true;
    var url = new URL(window.location.href);
    var utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (key) {
      var value = url.searchParams.get(key);
      if (value) utm[key] = value;
    });

    fetch(crmOrigin + "/api/public/widget/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: publicKey,
        sourceUrl: window.location.href,
        referrer: document.referrer || undefined,
        utm: utm
      })
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error(body.error || "Unable to start chat");
          return body;
        });
      })
      .then(function (data) {
        session = { conversationId: data.conversationId, token: data.token };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(session));
        } catch (_) {
          // The iframe still receives this session for the current page visit.
        }
        launcher.disabled = false;
        launcher.innerHTML = opened ? ICON_CLOSE : ICON_CHAT;
        postSession();
      })
      .catch(function (error) {
        launcher.disabled = false;
        launcher.innerHTML = opened ? ICON_CLOSE : ICON_CHAT;
        console.error("[ECMT Widget] " + error.message);
      });
  }

  launcher.addEventListener("click", function () {
    if (opened) {
      closeChat();
      return;
    }
    openChat();
  });

  nudge.addEventListener("click", function () {
    openChat();
  });

  frame.addEventListener("load", function () {
    loaded = true;
    postSession();
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== crmOrigin || event.source !== frame.contentWindow) return;
    if (event.data && event.data.type === "ecmt-widget-ready") postSession();
    if (event.data && event.data.type === "ecmt-widget-close") closeChat();
  });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(nudge);
    document.body.appendChild(launcher);
    scheduleNudge();
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})();
