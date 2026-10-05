/* =========================================================
   VIREON — DEXTOOLS CHART EMBED
   File: token-chart.js
   (renamed from pons-chart.js — logic unchanged, only the
   window namespace and internal dataset names were renamed
   to match the token.js rename)

   DexTools already indexes Robinhood Chain and shows real
   chart + trade history for a pair, so this just points an
   iframe at their widget instead of scanning Swap events
   ourselves. showTradeHistory=true below is what makes the
   the embedded trade-history panel is disabled — there is no
   separate custom trades pipeline anymore.

   LOAD ORDER (in your HTML):
     1. token.js
     2. token-chart.js

   USAGE (same call shape as before):
     PonslyTokenChart.mountChart(tokenAddress, container, {
       dextoolsPairId: tokenData.dextoolsPairId,   // required
       theme: 'dark'                               // optional, 'dark' | 'light', default 'dark'
     });

   IMPORTANT — VERIFY BEFORE TRUSTING THIS BLINDLY:
   The DexTools widget URL below uses "robinhood" as the chain
   slug, based on https://www.dextools.io/app/robinhood/pairs
   loading in a browser. This has not been independently
   confirmed to be correct for the widget-chart embed endpoint
   specifically (the /app/ site and the /widget-chart/ embed are
   different services under the same domain). If the iframe below
   shows a DexTools error page instead of a chart, the chain slug
   is the first thing to check — search your pool on dextools.io
   manually, click the embed/share icon on the pair page, and copy
   the exact URL DexTools generates for you instead of trusting
   DEXTOOLS_CHAIN_SLUG here.
   ========================================================= */

(function () {
  "use strict";

  const DEXTOOLS_CHAIN_SLUG = "robinhood";
  const DEXTOOLS_WIDGET_BASE = "https://www.dextools.io/widget-chart/en";

  function clear(container) {
    if (!(container instanceof HTMLElement)) return;

    const frame = container.querySelector('[data-token-chart="1"]');
    if (frame) frame.remove();

    const state = container.querySelector('[data-token-state="1"]');
    if (state) state.remove();
  }

  function renderState(container, message) {
    if (!(container instanceof HTMLElement)) return;

    clear(container);

    const el = document.createElement("div");
    el.dataset.tokenState = "1";
    el.style.cssText = [
      "width:100%",
      "height:420px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-size:13px",
      "line-height:1.5",
      "color:rgba(255,255,255,.45)",
      "background:transparent",
      "text-align:center",
      "padding:24px",
      "box-sizing:border-box",
      "white-space:pre-line"
    ].join(";");
    el.textContent = message;

    container.appendChild(el);
  }

  function buildWidgetUrl(pairId, options) {
    // These exact params (path segment "pe-light" included, even when
    // theme=dark) were copied verbatim from the embed code DexTools
    // itself generated for this pair — don't "clean up" pe-light vs
    // pe-dark, it's apparently the widget chrome, not the color theme.
    const url = new URL(
      `${DEXTOOLS_WIDGET_BASE}/${encodeURIComponent(DEXTOOLS_CHAIN_SLUG)}/pe-light/${pairId}`
    );

    url.searchParams.set("theme", options.theme === "light" ? "light" : "dark");
    url.searchParams.set("chartType", "1");
    url.searchParams.set("chartResolution", String(options.chartResolution || 1));
    url.searchParams.set("drawingToolbars", "false");
    url.searchParams.set("showTradeHistory", "false");
    url.searchParams.set("chartInUsd", "true");
    url.searchParams.set("headerColor", "1F2937");
    url.searchParams.set("tvPlatformColor", "1F2937");
    url.searchParams.set("tvPaneColor", "1F2937");
    url.searchParams.set("tradeHistoryColor", "1F2937");

    return url.toString();
  }

  const activeCharts = new WeakSet();

  function mountChart(tokenAddress, container, options = {}) {
    if (!(container instanceof HTMLElement)) return false;

    clear(container);

    // dextoolsPairId is DexTools' own internal pair ID (from
    // token.js's KNOWN_TOKENS / DEXTOOLS_PAIR_IDS lookup) — NOT the
    // same as the on-chain pool/curve address. poolAddress alone
    // can't build a working DexTools embed.
    const pairId = options.dextoolsPairId;

    if (!pairId) {
      renderState(container, "No DexTools chart configured for this token yet.");
      return false;
    }

    const url = buildWidgetUrl(pairId, options);

    const iframe = document.createElement("iframe");
    iframe.dataset.tokenChart = "1";
    iframe.src = url;
    iframe.title = "DexTools chart";
    iframe.loading = "lazy";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.style.cssText = [
      "display:block",
      "width:100%",
      "height:420px",
      "border:0",
      "background:transparent"
    ].join(";");

    container.appendChild(iframe);
    activeCharts.add(container);

    return true;
  }

  function unmountChart(container) {
    if (!(container instanceof HTMLElement)) return;
    clear(container);
    activeCharts.delete(container);
  }

  window.PonslyTokenChart = {
    mountChart,
    unmountChart
  };

  console.log("[Ponsly] token-chart.js loaded");
})();
