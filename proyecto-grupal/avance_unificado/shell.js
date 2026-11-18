(function ($) {
  'use strict';

  var PURIFY = {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'br', 'small', 'ul', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i
  };

  var KSI = window.KSI = {};

  KSI.limpiar = function (html) {
    if (!window.DOMPurify) { return $('<div>').text(String(html)).html(); }
    return window.DOMPurify.sanitize(String(html), PURIFY);
  };

  KSI.html = function ($el, html) {
    $el.html(KSI.limpiar(html));
    return window.DOMPurify ? window.DOMPurify.removed.length : 0;
  };

  KSI.eliminados = function () {
    if (!window.DOMPurify) { return []; }
    return window.DOMPurify.removed.map(function (r) {
      if (r.element) { return r.element.nodeName.toLowerCase(); }
      return r.attribute ? r.attribute.name : '?';
    });
  };

  KSI.vistas = function (porDefecto) {
    function mostrar(foco) {
      var hash = location.hash.slice(1);
      var $vistas = $('.ksi-view');
      var existe = $vistas.filter(function () { return $(this).attr('data-view') === hash; }).length > 0;
      var vista = existe ? hash : porDefecto;
      $vistas.each(function () {
        var activa = $(this).attr('data-view') === vista;
        $(this).toggleClass('ksi-view--activa', activa);
        if (activa && foco) { $(this).attr('tabindex', '-1')[0].focus({ preventScroll: true }); }
      });
      $('.ksi-nav__link').each(function () {
        var activo = $(this).attr('data-view') === vista;
        $(this).toggleClass('ksi-nav__link--activo', activo).attr('aria-current', activo ? 'page' : null);
      });
      $(document).trigger('ksi:vista', [vista]);
    }
    $(window).off('hashchange.ksi').on('hashchange.ksi', function () { mostrar(true); });
    mostrar(false);
  };

  KSI.registrarSW = function () {
    if (!('serviceWorker' in navigator)) { return; }
    $(window).off('load.ksi').on('load.ksi', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  };
})(jQuery);
