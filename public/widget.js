(function () {
  "use strict";

  if (window.__ECMT_WEBSITE_WIDGET__) return;
  window.__ECMT_WEBSITE_WIDGET__ = true;

  var script = document.currentScript;
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
  var label = script.getAttribute("data-label") || "Chat with admissions";
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

  var style = document.createElement("style");
  style.textContent =
    ".ecmt-chat-launcher{position:fixed;z-index:2147483646;bottom:20px;" +
    position +
    ":20px;border:0;border-radius:999px;background:#2563eb;color:#fff;padding:13px 18px;" +
    "font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
    "box-shadow:0 10px 30px rgba(37,99,235,.28);cursor:pointer}" +
    ".ecmt-chat-frame{position:fixed;z-index:2147483647;bottom:76px;" +
    position +
    ":20px;width:min(390px,calc(100vw - 32px));height:min(620px,calc(100vh - 110px));" +
    "border:0;border-radius:16px;box-shadow:0 18px 60px rgba(15,23,42,.28);background:#fff;display:none;overflow:hidden}";
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "ecmt-chat-launcher";
  launcher.textContent = label;
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
    launcher.textContent = "Starting chat…";
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
        launcher.textContent = opened ? "Close chat" : label;
        postSession();
      })
      .catch(function (error) {
        launcher.disabled = false;
        launcher.textContent = label;
        console.error("[ECMT Widget] " + error.message);
      });
  }

  launcher.addEventListener("click", function () {
    opened = !opened;
    frame.style.display = opened ? "block" : "none";
    launcher.textContent = opened ? "Close chat" : label;
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
