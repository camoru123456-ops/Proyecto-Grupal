(function () {
  'use strict';
  if (typeof PerformanceObserver === 'undefined') { return; }

  var pagina = document.documentElement.getAttribute('data-page') || 'tienda';
  var v = window.KSI_VITALS = { lcp: null, cls: null };
  var soportados = PerformanceObserver.supportedEntryTypes || [];

  function avisar() {
    document.dispatchEvent(new CustomEvent('ksi:vitals', { detail: v }));
  }

  try {
    if (soportados.indexOf('largest-contentful-paint') > -1) {
      new PerformanceObserver(function (lista) {
        var e = lista.getEntries();
        v.lcp = e[e.length - 1].startTime;
        avisar();
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    }
    if (soportados.indexOf('layout-shift') > -1) {
      v.cls = 0;
      new PerformanceObserver(function (lista) {
        lista.getEntries().forEach(function (e) {
          if (!e.hadRecentInput) { v.cls += e.value; }
        });
        avisar();
      }).observe({ type: 'layout-shift', buffered: true });
    }
  } catch (err) {
    return;
  }

  function guardar() {
    try {
      localStorage.setItem('ksi:vitals:' + pagina, JSON.stringify({ lcp: v.lcp, cls: v.cls }));
    } catch (err) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { guardar(); }
  });
  window.addEventListener('pagehide', guardar);
})();
