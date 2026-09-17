/**
 * regional.js — Regional Options page (icecollective.com/proven/regional).
 *
 * Displays the interactive "Regional options 0, 1 & 2.6" dial page (served by
 * ?action=regionalReport) inside a sandboxed iframe. Self-contained IIFE like
 * annual.js — shares the leaderboard's phone-OTP login session (same
 * localStorage token key) and the Annual Report's allowlist; everyone else
 * gets a no-access card.
 *
 * Embed (Webflow page /proven/regional):
 *   <div id="regional-app"></div>
 *   <link rel="stylesheet" href=".../growth.css">   (login overlay styles)
 *   <script src=".../regional.js"></script>
 */
(function () {
  "use strict";

  var API_URL = "https://script.google.com/macros/s/AKfycbwAum0sv4KhswD0Svr2QWEdBw4cP2K-_wg_bBzkA4lNAgWDX58JX4ODT9xRXxljqR5T/exec";
  var DEBUG = /[?&]debug=1/.test(location.search);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Same pattern as annual.js: the card styles are scoped to this page's app
  // div; the login overlay styles are body-level in growth.css and shared.
  function injectStyles() {
    if (document.getElementById("regional-style")) return;
    var st = document.createElement("style");
    st.id = "regional-style";
    st.textContent =
      "#regional-app .rg-loading { text-align:center; color:#6b7280; font-weight:600; padding:80px 0; font-family:Helvetica,Arial,sans-serif; }" +
      "#regional-app .rg-spin { width:34px; height:34px; border-radius:50%; border:3px solid #e5e7eb; border-top-color:#1c2140; margin:0 auto 14px; animation:rg-spin .8s linear infinite; }" +
      "@keyframes rg-spin { to { transform:rotate(360deg); } }" +
      "#regional-app .rg-loading .rg-msg { animation:rg-pulse 1.6s ease-in-out infinite; }" +
      "@keyframes rg-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }" +
      "@media (prefers-reduced-motion: reduce) { #regional-app .rg-spin, #regional-app .rg-loading .rg-msg { animation:none; } }" +
      "#regional-app .rg-noaccess { max-width:420px; margin:70px auto; text-align:center; background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:28px 26px; font-family:Helvetica,Arial,sans-serif; }" +
      "#regional-app .rg-noaccess h2 { font-size:19px; font-weight:800; margin:0 0 8px; color:#0f172a; }" +
      "#regional-app .rg-noaccess p { font-size:13.5px; color:#6b7280; line-height:1.5; margin:0 0 16px; }" +
      "#regional-app .rg-noaccess button { font:inherit; font-weight:700; font-size:13px; padding:9px 18px; border-radius:9px; border:1px solid #cbd5e1; background:#f8fafc; color:#0f172a; cursor:pointer; }" +
      "#regional-app iframe.rg-frame { width:100%; height:calc(100vh - 24px); border:0; display:block; background:#fafafa; }";
    document.head.appendChild(st);
  }

  // ---- auth (copied from growth.js — same token => shared session) ---------
  var AUTH_KEY = "pl_session_token";
  function getSessionToken() { try { return localStorage.getItem(AUTH_KEY) || ""; } catch (e) { return ""; } }
  function setSessionToken(t) { try { localStorage.setItem(AUTH_KEY, t); } catch (e) {} }
  function clearSessionToken() { try { localStorage.removeItem(AUTH_KEY); } catch (e) {} }

  async function loginRequestCode(phone) {
    var res = await fetch(API_URL + "?action=requestCode&phone=" + encodeURIComponent(phone));
    return res.json();
  }
  async function loginVerifyCode(phone, code) {
    var res = await fetch(API_URL + "?action=verifyCode&phone=" + encodeURIComponent(phone) + "&code=" + encodeURIComponent(code));
    return res.json();
  }

  function ensureLoginOverlay() {
    if (document.getElementById("pl-login-overlay")) return;
    var o = document.createElement("div");
    o.id = "pl-login-overlay";
    o.className = "pl-modal";
    o.innerHTML =
      '<div class="pl-login-card">' +
        '<div class="pl-login-logo">PROVEN<span>REGIONAL</span></div>' +
        '<div class="pl-login-title">Sign in</div>' +
        '<div class="pl-login-sub">Enter your phone number and we’ll text you a code.</div>' +
        '<div id="pl-login-step1">' +
          '<input id="pl-login-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-5555">' +
          '<button id="pl-login-send" type="button" class="pl-login-btn">Text me a code</button>' +
        '</div>' +
        '<div id="pl-login-step2" style="display:none">' +
          '<input id="pl-login-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code">' +
          '<button id="pl-login-verify" type="button" class="pl-login-btn">Verify & sign in</button>' +
          '<button id="pl-login-back" type="button" class="pl-login-linkbtn">Use a different number</button>' +
        '</div>' +
        '<div id="pl-login-msg" class="pl-login-msg"></div>' +
      '</div>';
    document.body.appendChild(o);

    var phoneEl = o.querySelector("#pl-login-phone");
    var codeEl = o.querySelector("#pl-login-code");
    var msgEl = o.querySelector("#pl-login-msg");
    var step1 = o.querySelector("#pl-login-step1");
    var step2 = o.querySelector("#pl-login-step2");
    var sendBtn = o.querySelector("#pl-login-send");
    var verifyBtn = o.querySelector("#pl-login-verify");
    var setMsg = function (t, err) { msgEl.textContent = t || ""; msgEl.className = "pl-login-msg" + (err ? " pl-login-err" : ""); };

    sendBtn.addEventListener("click", async function () {
      var phone = (phoneEl.value || "").trim();
      if (phone.replace(/\D/g, "").length < 10) { setMsg("Enter a valid 10-digit phone number.", true); return; }
      sendBtn.disabled = true; setMsg("Sending…");
      try {
        var r = await loginRequestCode(phone);
        if (r && r.ok) { step1.style.display = "none"; step2.style.display = "block"; setMsg("Code sent. Check your texts."); codeEl.focus(); }
        else { setMsg((r && r.error) || "Couldn't send a code.", true); }
      } catch (e) { setMsg("Network error. Try again.", true); }
      sendBtn.disabled = false;
    });

    verifyBtn.addEventListener("click", async function () {
      var phone = (phoneEl.value || "").trim();
      var code = (codeEl.value || "").trim();
      if (!code) { setMsg("Enter the code we texted you.", true); return; }
      verifyBtn.disabled = true; setMsg("Verifying…");
      try {
        var r = await loginVerifyCode(phone, code);
        if (r && r.ok && r.token) { setSessionToken(r.token); setMsg("Signed in."); hideLoginOverlay(); bootRegional(); }
        else { setMsg((r && r.error) || "That code wasn't right.", true); verifyBtn.disabled = false; }
      } catch (e) { setMsg("Network error. Try again.", true); verifyBtn.disabled = false; }
    });

    o.querySelector("#pl-login-back").addEventListener("click", function () {
      step2.style.display = "none"; step1.style.display = "block"; setMsg(""); phoneEl.focus();
    });
    codeEl.addEventListener("keydown", function (e) { if (e.key === "Enter") verifyBtn.click(); });
    phoneEl.addEventListener("keydown", function (e) { if (e.key === "Enter") sendBtn.click(); });
  }
  function showLoginOverlay() {
    ensureLoginOverlay();
    var o = document.getElementById("pl-login-overlay");
    if (o) { o.style.display = "flex"; var p = o.querySelector("#pl-login-phone"); if (p) p.focus(); }
  }
  function hideLoginOverlay() {
    var o = document.getElementById("pl-login-overlay");
    if (o) o.style.display = "none";
  }

  // ---- rendering -----------------------------------------------------------
  function appEl() { return document.getElementById("regional-app"); }

  function renderLoading(msg) {
    if (msg === "") { appEl().innerHTML = ""; return; }
    appEl().innerHTML = '<div class="rg-loading"><div class="rg-spin"></div><div class="rg-msg">' +
      esc(msg == null ? "Loading…" : msg) + "</div></div>";
  }

  function renderNoAccess(name) {
    appEl().innerHTML =
      '<div class="rg-noaccess">' +
        "<h2>This page is permission-only.</h2>" +
        "<p>You're signed in" + (name ? " as <b>" + esc(name) + "</b>" : "") + ", but this account doesn't have access to the Regional Options page. Ask Justin if you think it should.</p>" +
        '<button id="rg-switch" type="button">Sign in with a different number</button>' +
      "</div>";
    document.getElementById("rg-switch").addEventListener("click", function () {
      clearSessionToken();
      showLoginOverlay();
    });
  }

  function renderPage(html) {
    var app = appEl();
    app.innerHTML = "";
    var f = document.createElement("iframe");
    f.className = "rg-frame";
    f.setAttribute("sandbox", "allow-scripts allow-same-origin");
    f.srcdoc = html;
    app.appendChild(f);
  }

  async function bootRegional() {
    injectStyles();
    if (!getSessionToken()) { renderLoading(""); showLoginOverlay(); return; }
    renderLoading();
    var t = getSessionToken();
    try {
      var res = await fetch(API_URL + "?action=regionalReport&token=" + encodeURIComponent(t));
      var j = await res.json();

      if (j && j.authRequired) {
        clearSessionToken();
        showLoginOverlay();
        return;
      }
      if (j && j.accessDenied) { renderNoAccess(j.name); return; }
      if (!j || !j.ok || !j.html) {
        appEl().innerHTML = '<div class="rg-loading">' + esc((j && j.error) || "Couldn't load the page. Refresh to try again.") + "</div>";
        return;
      }

      hideLoginOverlay();
      renderPage(j.html);
    } catch (e) {
      appEl().innerHTML = '<div class="rg-loading">Couldn’t load the page. Refresh to try again.</div>';
      if (DEBUG) console.error(e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootRegional);
  } else {
    bootRegional();
  }
})();
