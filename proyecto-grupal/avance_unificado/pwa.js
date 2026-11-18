(function ($) {
  'use strict';

  var KSI = window.KSI;
  var MUESTRA = '<strong>Pieza certificada</strong> con <em>madera FSC</em>.<img src="x" onerror="window.__xss=1"><script>window.__xss=1<\/script><a href="javascript:window.__xss=1">Ver ficha</a>';
  var instalador = null;

  function nivel(valor, bueno, medio) {
    return valor <= bueno ? 'bueno' : (valor <= medio ? 'medio' : 'malo');
  }

  function pintar($el, nv) {
    $.each(['bueno', 'medio', 'malo'], function (_, n) {
      $el.toggleClass('ksi-tile__value--' + n, n === nv);
    });
  }

  function red() {
    var on = navigator.onLine;
    $('#net-estado').text(on ? 'Conectado' : 'Sin conexión');
    pintar($('#net-estado'), on ? 'bueno' : 'malo');
  }

  function workers() {
    if (!('serviceWorker' in navigator)) {
      $('#sw-estado').text('No compatible');
      $('#sw-detalle').text('Este navegador no admite Service Workers.');
      return;
    }
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) {
        $('#sw-estado').text('Sin registrar');
        $('#sw-detalle').text('Se registra al cargar esta página con conexión.');
        pintar($('#sw-estado'), 'medio');
        return;
      }
      var w = reg.active || reg.waiting || reg.installing;
      var nombres = { installing: 'Instalando', installed: 'Instalado', activating: 'Activando', activated: 'Activo', redundant: 'Reemplazado' };
      $('#sw-estado').text(nombres[w && w.state] || '—');
      pintar($('#sw-estado'), w && w.state === 'activated' ? 'bueno' : 'medio');
      $('#sw-detalle').text((navigator.serviceWorker.controller ? 'Controla esta página' : 'Recarga para que controle esta página') + ' · ' + reg.scope.replace(location.origin, ''));
      if (w && w.state !== 'activated') { w.addEventListener('statechange', workers, { once: true }); }
    });
  }

  function cache() {
    if (!('caches' in window)) {
      $('#cache-estado').text('No compatible');
      return;
    }
    caches.keys().then(function (claves) {
      if (!claves.length) {
        $('#cache-estado').text('Vacío');
        $('#cache-detalle').text('Se llena al visitar la tienda con conexión.');
        return null;
      }
      return caches.open(claves[0]).then(function (c) { return c.keys(); }).then(function (reqs) {
        $('#cache-estado').text(claves[0] + ' · ' + reqs.length + ' archivos');
        $('#cache-detalle').text(reqs.map(function (r) { return new URL(r.url).pathname.split('/').pop() || './'; }).join(' · '));
      });
    });
  }

  function instalacion() {
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone) {
      $('#inst-estado').text('Instalada');
      $('#inst-detalle').text('Estás usando la app en modo standalone.');
      $('#inst-btn').prop('disabled', true);
    } else if (instalador) {
      $('#inst-estado').text('Disponible');
      $('#inst-btn').prop('disabled', false);
    } else {
      $('#inst-estado').text('Desde el navegador');
      $('#inst-detalle').text('Usa «Instalar» o «Añadir a inicio» en el menú.');
    }
  }

  function vitals() {
    var v = window.KSI_VITALS || {};
    if (v.lcp != null) {
      $('#vit-lcp').text((v.lcp / 1000).toFixed(2) + ' s');
      pintar($('#vit-lcp'), nivel(v.lcp, 2500, 4000));
    }
    if (typeof v.cls === 'number') {
      $('#vit-cls').text(v.cls.toFixed(3));
      pintar($('#vit-cls'), nivel(v.cls, 0.1, 0.25));
    }
  }

  function vitalsTienda() {
    try {
      var g = JSON.parse(localStorage.getItem('ksi:vitals:tienda'));
      if (g && g.lcp != null && typeof g.cls === 'number') {
        $('#vit-tienda').text('Tienda, última visita: LCP ' + (g.lcp / 1000).toFixed(2) + ' s · CLS ' + g.cls.toFixed(3));
      }
    } catch (err) {}
  }

  function demo() {
    var quitados = KSI.html($('#demo-salida'), $('#demo-entrada').val().slice(0, 600));
    var lista = KSI.eliminados();
    $('#demo-resumen').text(quitados ? 'DOMPurify eliminó ' + quitados + ': ' + lista.join(', ') + '.' : 'Nada que eliminar: el contenido ya era seguro.');
  }

  function especificidad(sel) {
    var limpio = sel.replace(/::[\w-]+/g, ' x');
    var ids = (limpio.match(/#[\w-]+/g) || []).length;
    var clases = (limpio.match(/\.[\w-]+/g) || []).length + (limpio.match(/\[[^\]]+\]/g) || []).length + (limpio.match(/:[\w-]+/g) || []).length;
    var elems = (limpio.replace(/[.#:[][^\s>+~,]*/g, ' ').match(/[a-z][\w-]*/gi) || []).length;
    return [ids, clases, elems];
  }

  function auditoria() {
    var reglas = 0, importantes = 0, ids = 0, max = [0, 0, 0];
    function valor(e) { return e[0] * 100 + e[1] * 10 + e[2]; }
    function recorrer(lista) {
      $.each(lista, function (_, r) {
        if (r.cssRules && r.type !== 1) { recorrer(r.cssRules); return; }
        if (r.type !== 1) { return; }
        reglas++;
        for (var i = 0; i < r.style.length; i++) {
          if (r.style.getPropertyPriority(r.style[i]) === 'important') { importantes++; break; }
        }
        $.each(r.selectorText.split(','), function (_, s) {
          var e = especificidad(s);
          if (e[0]) { ids++; }
          if (valor(e) > valor(max)) { max = e; }
        });
      });
    }
    $.each(document.styleSheets, function (_, hoja) {
      try { recorrer(hoja.cssRules); } catch (err) {}
    });
    $('#aud-reglas').text(reglas);
    $('#aud-imp').text(importantes);
    $('#aud-ids').text(ids);
    $('#aud-esp').text(max.join('-'));
  }

  $(function () {
    KSI.vistas('estado');

    $('#demo-entrada').val(MUESTRA);

    $('#demo-entrada').off('input').on('input', demo);

    $('.ksi-tiles').off('click')
      .on('click', '#sw-actualizar', function () {
        $('#sw-detalle').text('Buscando actualización…');
        navigator.serviceWorker.getRegistration()
          .then(function (reg) { return reg ? reg.update() : null; })
          .then(function () { $('#sw-detalle').text('Búsqueda terminada.'); setTimeout(workers, 1500); })
          .catch(function () { $('#sw-detalle').text('No se pudo buscar: sin conexión.'); });
      })
      .on('click', '#cache-limpiar', function () {
        caches.keys()
          .then(function (claves) { return Promise.all(claves.map(function (k) { return caches.delete(k); })); })
          .then(cache);
      })
      .on('click', '#inst-btn', function () {
        if (!instalador) { return; }
        instalador.prompt();
        instalador.userChoice.then(function () { instalador = null; instalacion(); });
      });

    $(window).off('online.ksi offline.ksi').on('online.ksi offline.ksi', red);
    $(document).off('ksi:vitals').on('ksi:vitals', vitals);

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      instalador = e;
      instalacion();
    });
    window.addEventListener('appinstalled', function () { instalador = null; instalacion(); });

    red();
    workers();
    cache();
    instalacion();
    vitals();
    vitalsTienda();
    demo();
    auditoria();
    if ('serviceWorker' in navigator) { navigator.serviceWorker.ready.then(function () { workers(); cache(); }); }
  });

  KSI.registrarSW();
})(jQuery);
