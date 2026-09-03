/**
 * annual.js — Proven Annual Report (icecollective.com/proven/annual).
 *
 * Displays the pre-built annual report HTML (served by ?action=annualReport)
 * inside a sandboxed iframe. Self-contained IIFE like growth.js — shares the
 * leaderboard's phone-OTP login session (same localStorage token key) and its
 * own ANNUAL_ACCESS_PHONES allowlist; everyone else gets a no-access card.
 *
 * Embed (Webflow page /proven/annual):
 *   <div id="annual-app"></div>
 *   <link rel="stylesheet" href=".../growth.css">   (login overlay styles)
 *   <script src=".../annual.js"></script>
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

  // The gr-* card styles in growth.css are scoped to #growth-app, so this page
  // carries its own copies scoped to #annual-app (login overlay styles are
  // body-level in growth.css and shared as-is).
  function injectStyles() {
    if (document.getElementById("annual-style")) return;
    var st = document.createElement("style");
    st.id = "annual-style";
    st.textContent =
      "#annual-app .yr-loading { text-align:center; color:#6b7280; font-weight:600; padding:80px 0; font-family:Helvetica,Arial,sans-serif; }" +
      "#annual-app .yr-spin { width:34px; height:34px; border-radius:50%; border:3px solid #e5e7eb; border-top-color:#1c2140; margin:0 auto 14px; animation:yr-spin .8s linear infinite; }" +
      "@keyframes yr-spin { to { transform:rotate(360deg); } }" +
      "#annual-app .yr-loading .yr-msg { animation:yr-pulse 1.6s ease-in-out infinite; }" +
      "@keyframes yr-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }" +
      "@media (prefers-reduced-motion: reduce) { #annual-app .yr-spin, #annual-app .yr-loading .yr-msg { animation:none; } }" +
      "#annual-app .yr-noaccess { max-width:420px; margin:70px auto; text-align:center; background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:28px 26px; font-family:Helvetica,Arial,sans-serif; }" +
      "#annual-app .yr-noaccess h2 { font-size:19px; font-weight:800; margin:0 0 8px; color:#0f172a; }" +
      "#annual-app .yr-noaccess p { font-size:13.5px; color:#6b7280; line-height:1.5; margin:0 0 16px; }" +
      "#annual-app .yr-noaccess button { font:inherit; font-weight:700; font-size:13px; padding:9px 18px; border-radius:9px; border:1px solid #cbd5e1; background:#f8fafc; color:#0f172a; cursor:pointer; }" +
      "#annual-app iframe.yr-frame { width:100%; height:calc(100vh - 24px); border:0; display:block; background:#fafafa; }";
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
        '<div class="pl-login-logo">PROVEN<span>REPORT</span></div>' +
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
        if (r && r.ok && r.token) { setSessionToken(r.token); setMsg("Signed in."); hideLoginOverlay(); bootAnnual(); }
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
  function appEl() { return document.getElementById("annual-app"); }

  function renderLoading(msg) {
    if (msg === "") { appEl().innerHTML = ""; return; }
    appEl().innerHTML = '<div class="yr-loading"><div class="yr-spin"></div><div class="yr-msg">' +
      esc(msg == null ? "Loading the report…" : msg) + "</div></div>";
  }

  function renderNoAccess(name) {
    appEl().innerHTML =
      '<div class="yr-noaccess">' +
        "<h2>This report is permission-only.</h2>" +
        "<p>You're signed in" + (name ? " as <b>" + esc(name) + "</b>" : "") + ", but this account doesn't have access to the Annual Report. Ask Justin if you think it should.</p>" +
        '<button id="yr-switch" type="button">Sign in with a different number</button>' +
      "</div>";
    document.getElementById("yr-switch").addEventListener("click", function () {
      clearSessionToken();
      showLoginOverlay();
    });
  }

  function renderReport(html) {
    var app = appEl();
    app.innerHTML = "";
    var f = document.createElement("iframe");
    f.className = "yr-frame";
    f.setAttribute("sandbox", "allow-scripts allow-same-origin");
    // Default the report to the 2026 tab (older Drive copies default to 2025).
    f.srcdoc = html.replace("else showTab('25');", "else showTab('26');");
    app.appendChild(f);
  }

  function renderMobileGate() {
    appEl().innerHTML =
      '<div class="yr-noaccess">' +
        "<h2>Not supported on mobile yet.</h2>" +
        "<p>Open the Annual Report on a computer &mdash; or if your phone&rsquo;s screen is big enough, turn it sideways.</p>" +
      "</div>";
  }

  // Screens narrower than 700px can't fit the report; the gate lifts live if
  // the screen gets wide enough (e.g. a big phone rotating to landscape).
  var mobileGateMq = window.matchMedia ? window.matchMedia("(max-width: 700px)") : null;
  function watchMobileGate() {
    var onChange = function (e) {
      if (e.matches) return;
      if (mobileGateMq.removeEventListener) mobileGateMq.removeEventListener("change", onChange);
      else mobileGateMq.removeListener(onChange);
      bootAnnual();
    };
    if (mobileGateMq.addEventListener) mobileGateMq.addEventListener("change", onChange);
    else mobileGateMq.addListener(onChange);
  }

  async function bootAnnual() {
    injectStyles();
    if (mobileGateMq && mobileGateMq.matches) { renderMobileGate(); watchMobileGate(); return; }
    if (!getSessionToken()) { renderLoading(""); showLoginOverlay(); return; }
    renderLoading();
    var t = getSessionToken();
    try {
      var res = await fetch(API_URL + "?action=annualReport&token=" + encodeURIComponent(t));
      var j = await res.json();

      if (j && j.authRequired) {
        clearSessionToken();
        showLoginOverlay();
        return;
      }
      if (j && j.accessDenied) { renderNoAccess(j.name); return; }
      if (!j || !j.ok || !j.html) {
        appEl().innerHTML = '<div class="yr-loading">' + esc((j && j.error) || "Couldn't load the report. Refresh to try again.") + "</div>";
        return;
      }

      hideLoginOverlay();
      renderReport(j.html);
    } catch (e) {
      appEl().innerHTML = '<div class="yr-loading">Couldn’t load the report. Refresh to try again.</div>';
      if (DEBUG) console.error(e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAnnual);
  } else {
    bootAnnual();
  }
})();
