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
  var opened = false;
  var loaded = false;
  var session = null;
  var storageKey = "ecmt_widget_session_" + crmOrigin + "_" + publicKey;

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
    ":20px;display:flex;align-items:center;justify-content:center;width:60px;height:60px;" +
    "border:0;border-radius:999px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;" +
    "box-shadow:0 12px 30px rgba(37,99,235,.4);cursor:pointer;padding:0;" +
    "transition:transform .18s ease,box-shadow .18s ease}" +
    ".ecmt-chat-launcher:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 16px 36px rgba(37,99,235,.48)}" +
    ".ecmt-chat-launcher:disabled{opacity:.7;cursor:default}" +
    ".ecmt-chat-launcher svg{display:block}" +
    ".ecmt-chat-frame{position:fixed;z-index:2147483647;bottom:92px;" +
    position +
    ":20px;width:min(390px,calc(100vw - 32px));height:min(620px,calc(100vh - 130px));" +
    "border:0;border-radius:16px;box-shadow:0 18px 60px rgba(15,23,42,.28);background:#fff;display:none;overflow:hidden}";
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "ecmt-chat-launcher";
  launcher.innerHTML = ICON_CHAT;
  launcher.setAttribute("aria-label", label);

  var frame = document.createElement("iframe");
  frame.className = "ecmt-chat-frame";
  frame.title = "Admissions Assistant";
  frame.setAttribute("allow", "clipboard-write");
  frame.src = crmOrigin + "/widget";

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
    opened = !opened;
    frame.style.display = opened ? "block" : "none";
    launcher.innerHTML = opened ? ICON_CLOSE : ICON_CHAT;
    launcher.setAttribute("aria-label", opened ? "Close chat" : label);
    if (opened) startSession();
  });

  frame.addEventListener("load", function () {
    loaded = true;
    postSession();
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== crmOrigin || event.source !== frame.contentWindow) return;
    if (event.data && event.data.type === "ecmt-widget-ready") postSession();
  });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(launcher);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})();
