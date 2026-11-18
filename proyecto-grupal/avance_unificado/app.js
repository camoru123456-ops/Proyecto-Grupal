(function ($) {
  'use strict';

  var KSI = window.KSI;
  var S = ' fill="rgba(255,255,255,.7)"';
  var DIBUJO = {
    silla: '<path d="M62 52Q100 40 138 52M66 136L62 52M134 136L138 52M66 148L60 208M134 148L140 208M44 208H156"/><rect x="58" y="136" width="84" height="12"' + S + '/>',
    mesa: '<path d="M58 117V208M142 117V208M58 160H142M44 208H156"/><rect x="24" y="108" width="152" height="9"' + S + '/>',
    sofa: '<path d="M34 174V186M166 174V186"/><rect x="38" y="96" width="124" height="38" rx="3"' + S + '/><rect x="22" y="118" width="26" height="56" rx="3"' + S + '/><rect x="152" y="118" width="26" height="56" rx="3"' + S + '/><rect x="48" y="134" width="104" height="40" rx="2"' + S + '/>',
    escritorio: '<path d="M40 112V208M160 112V208M32 208H48M152 208H168"/><rect x="22" y="106" width="156" height="6"' + S + '/><rect x="108" y="112" width="52" height="34"/>',
    cama: '<path d="M52 158V166M148 158V166M24 176H176"/><rect x="30" y="84" width="140" height="34" rx="2"' + S + '/><rect x="30" y="126" width="140" height="26" rx="2"' + S + '/><rect x="38" y="152" width="124" height="6"/>',
    estante: '<rect x="52" y="36" width="96" height="172"/><path d="M52 82H148M52 128H148M52 168H148M42 208H158"/><rect x="66" y="58" width="16" height="24"' + S + '/><circle cx="116" cy="70" r="12"' + S + '/><rect x="100" y="108" width="34" height="20"' + S + '/><rect x="64" y="146" width="12" height="22"' + S + '/>'
  };
  var MATERIALES = { madera: 'Madera certificada FSC', metal: 'Metal reciclado', fibra: 'Fibra natural', piedra: 'Piedra recuperada' };
  var CATEGORIAS = ['Sala', 'Comedor', 'Oficina', 'Dormitorio', 'Almacenamiento'];

  var PRODUCTOS = [];
  var POR_ID = Object.create(null);
  var estado = { cat: 'Todas', mat: 'todos', q: '', pagina: 0 };
  var tocado = {};

  function propio(obj, clave) {
    return Object.prototype.hasOwnProperty.call(obj, clave);
  }

  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function precio(n) {
    return 'Bs ' + Number(n).toLocaleString('en-US');
  }

  function texto(v, max) {
    return String(v == null ? '' : v).slice(0, max);
  }

  function numero(v) {
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function depurar(p) {
    if (!p || !/^[a-z0-9-]{1,40}$/.test(String(p.id))) { return null; }
    var o = {
      id: p.id,
      nombre: texto(p.nombre, 60),
      cat: (Array.isArray(p.cat) ? p.cat : []).filter(function (c) { return CATEGORIAS.indexOf(c) > -1; }),
      mat: propio(MATERIALES, p.mat) ? p.mat : 'madera',
      dibujo: propio(DIBUJO, p.dibujo) ? p.dibujo : 'silla',
      tinte: /^#[0-9a-f]{3,8}$/i.test(p.tinte) ? p.tinte : '#EFF1EE',
      precio: numero(p.precio),
      materialTxt: texto(p.materialTxt, 80),
      cert: texto(p.cert, 80),
      co2: numero(p.co2),
      ref: numero(p.ref),
      rec: Math.min(100, numero(p.rec)),
      reparable: p.reparable === true,
      fin: texto(p.fin, 80),
      desc: texto(p.desc, 240),
      notaHtml: texto(p.notaHtml, 400)
    };
    o.indice = norm([o.nombre, o.cat.join(' '), MATERIALES[o.mat], o.materialTxt, o.desc].join(' '));
    return o;
  }

  function ilustracion(p) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="' + p.tinte + '"/>' +
      '<g transform="translate(68 5) scale(.92)" fill="none" stroke="#3A3A38" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + DIBUJO[p.dibujo] + '</g></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function tarjeta(p) {
    var $img = $('<img>', {
      'class': 'ksi-card__img',
      src: ilustracion(p),
      alt: 'Ilustración de ' + p.nombre,
      loading: 'lazy',
      decoding: 'async'
    }).attr({ width: 320, height: 240 });

    var $media = $('<figure>', { 'class': 'ksi-card__media' }).css('background-color', p.tinte).append($img);
    var $body = $('<div>', { 'class': 'ksi-card__body' }).append(
      $('<p>', { 'class': 'ksi-card__cat' }).text(p.cat.join(' / ')),
      $('<h3>', { 'class': 'ksi-card__name', title: p.nombre }).text(p.nombre),
      $('<p>', { 'class': 'ksi-card__mat', title: p.materialTxt }).text(p.materialTxt),
      $('<p>', { 'class': 'ksi-card__desc' }).text(p.desc),
      $('<p>', { 'class': 'ksi-card__price' }).text(precio(p.precio)),
      $('<div>', { 'class': 'ksi-card__actions' }).append(
        $('<button>', { type: 'button', 'class': 'ksi-btn ksi-btn--line ksi-btn--sm', 'data-accion': 'ficha' }).text('Ver ficha'),
        $('<button>', { type: 'button', 'class': 'ksi-btn ksi-btn--sm', 'data-accion': 'cotizar' }).text('Cotizar')
      )
    );
    return $('<li>', { 'class': 'ksi-card ksi-card--oculta', 'data-id': p.id }).append($media, $body);
  }

  function porPagina() {
    if (window.matchMedia('(min-width: 1024px)').matches) { return 3; }
    return window.matchMedia('(min-width: 600px)').matches ? 2 : 1;
  }

  function coincide(p) {
    return (estado.cat === 'Todas' || p.cat.indexOf(estado.cat) > -1) &&
      (estado.mat === 'todos' || p.mat === estado.mat) &&
      (!estado.q || p.indice.indexOf(estado.q) > -1);
  }

  function mostrar() {
    var tam = porPagina();
    var ids = PRODUCTOS.filter(coincide).map(function (p) { return p.id; });
    var paginas = Math.max(1, Math.ceil(ids.length / tam));
    estado.pagina = Math.min(estado.pagina, paginas - 1);
    var visibles = ids.slice(estado.pagina * tam, estado.pagina * tam + tam);

    $('#catalogo-grid').css('--cols', Math.max(1, visibles.length)).children('.ksi-card').each(function () {
      $(this).toggleClass('ksi-card--oculta', visibles.indexOf($(this).attr('data-id')) === -1);
    });
    $('#catalogo-vacio').toggleClass('ksi-empty--visible', ids.length === 0).text(ids.length ? '' : 'No hay piezas con ese filtro. Cambia la búsqueda o la categoría.');
    $('#pager-info').text(ids.length ? 'Página ' + (estado.pagina + 1) + ' de ' + paginas + ' · ' + ids.length + (ids.length === 1 ? ' pieza' : ' piezas') : 'Sin resultados');
    $('#pager-prev').prop('disabled', estado.pagina === 0);
    $('#pager-next').prop('disabled', estado.pagina >= paginas - 1);
  }

  function abrirFicha(p) {
    var filas = [
      ['Material', p.materialTxt],
      ['Certificación', p.cert],
      ['Huella', p.co2 + ' kg CO₂e (convencional: ' + p.ref + ')'],
      ['Contenido reciclado', p.rec + ' %'],
      ['Fin de vida', p.fin]
    ];
    var $lista = $('#ficha-lista').empty();
    $.each(filas, function (_, f) {
      $lista.append($('<dt>', { 'class': 'ksi-sheet__term' }).text(f[0]), $('<dd>', { 'class': 'ksi-sheet__def' }).text(f[1]));
    });
    $('#ficha-titulo').text(p.nombre);
    $('#ficha-sub').text(p.cat.join(' / ') + ' · ' + precio(p.precio));
    KSI.html($('#ficha-nota'), p.notaHtml);
    document.getElementById('dlg-ficha').showModal();
  }

  function impacto() {
    var co2 = 0, ref = 0, rec = 0, rep = 0;
    $.each(PRODUCTOS, function (_, p) {
      co2 += p.co2;
      ref += p.ref;
      rec += p.rec;
      if (p.reparable) { rep++; }
    });
    var n = PRODUCTOS.length || 1;
    var datos = {
      huella: ref ? Math.round((1 - co2 / ref) * 100) : 0,
      reciclado: Math.round(rec / n),
      reparable: Math.round(rep / n * 100)
    };
    $.each(datos, function (clave, v) {
      var $m = $('[data-meter="' + clave + '"]');
      $m.find('.ksi-meter__value').text(v + ' %');
      $m.find('.ksi-meter__fill').css('width', v + '%');
    });
  }

  var CAMPOS = {
    nombre: function (v) {
      v = v.trim();
      if (!v) { return 'Escribe tu nombre completo.'; }
      if (!/^[\p{L}' -]+$/u.test(v)) { return 'Usa solo letras.'; }
      if (v.split(/\s+/).length < 2) { return 'Falta el apellido. Ej.: María Quispe'; }
      return '';
    },
    correo: function (v) {
      v = v.trim();
      if (!v) { return 'Escribe tu correo electrónico.'; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { return 'Revisa el formato. Ej.: maria@correo.com'; }
      return '';
    },
    pieza: function (v) {
      return POR_ID[v] ? '' : 'Elige una pieza del catálogo.';
    },
    cantidad: function (v) {
      var n = Number(v);
      if (String(v).trim() === '') { return 'Indica la cantidad. Ej.: 2'; }
      if (!Number.isInteger(n) || n < 1 || n > 50) { return 'Debe ser un entero entre 1 y 50.'; }
      return '';
    },
    mensaje: function (v) {
      var n = v.trim().length;
      if (n < 10) { return 'Escribe al menos 10 caracteres (llevas ' + n + ').'; }
      if (n > 200) { return 'Máximo 200 caracteres (llevas ' + n + ').'; }
      return '';
    }
  };

  function marcar($el, base, est) {
    $el.toggleClass(base + '--valido', est === 'valido').toggleClass(base + '--invalido', est === 'invalido');
  }

  function refrescar() {
    var validos = 0;
    var total = Object.keys(CAMPOS).length;
    $.each(CAMPOS, function (clave, validar) {
      var $c = $('[data-campo="' + clave + '"]');
      var $i = $c.find('.ksi-field__input');
      var $a = $c.find('.ksi-field__help');
      var msg = validar($i.val());
      var est = !msg ? 'valido' : (tocado[clave] ? 'invalido' : 'neutro');
      marcar($c.find('.ksi-field__control'), 'ksi-field__control', est);
      marcar($i, 'ksi-field__input', est);
      marcar($a, 'ksi-field__help', est);
      $i.attr('aria-invalid', est === 'invalido' ? 'true' : 'false');
      $a.text(est === 'valido' ? 'Correcto.' : (est === 'invalido' ? msg : $a.data('base')));
      if (!msg) { validos++; }
    });
    $('#cuenta-mensaje').text($('#c-mensaje').val().trim().length + '/200');

    var p = POR_ID[$('#c-pieza').val()];
    var n = Number($('#c-cantidad').val());
    var okCant = !CAMPOS.cantidad($('#c-cantidad').val());
    $('#cot-total').text(p && okCant ? precio(p.precio * n) + ' · ' + (p.co2 * n) + ' kg CO₂e' : '—');
    $('#cot-enviar').prop('disabled', validos < total);
  }

  function construirFiltros() {
    var $cat = $('#filtro-cat').append($('<option>', { value: 'Todas' }).text('Categoría'));
    $.each(CATEGORIAS, function (_, c) { $cat.append($('<option>', { value: c }).text(c)); });
    var $mat = $('#filtro-material').append($('<option>', { value: 'todos' }).text('Material'));
    $.each(MATERIALES, function (clave, nombre) { $mat.append($('<option>', { value: clave }).text(nombre)); });
    $('#c-pieza').append($('<option>', { value: '' }).text('Elige una pieza'));
    $('.ksi-field__help').each(function () { $(this).data('base', $(this).text()); });
  }

  function cargarCatalogo() {
    fetch('productos.json')
      .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); })
      .then(function (datos) {
        var lista = Array.isArray(datos && datos.productos) ? datos.productos : [];
        $.each(lista, function (_, crudo) {
          var p = depurar(crudo);
          if (!p || POR_ID[p.id]) { return; }
          PRODUCTOS.push(p);
          POR_ID[p.id] = p;
          $('#catalogo-grid').append(tarjeta(p));
          $('#c-pieza').append($('<option>', { value: p.id }).text(p.nombre));
        });
        impacto();
        mostrar();
        refrescar();
      })
      .catch(function () {
        $('#catalogo-vacio').addClass('ksi-empty--visible').text('No se pudo cargar el catálogo. Revisa tu conexión y vuelve a intentarlo.');
        $('#pager-info').text('Sin datos');
      });
  }

  function enlazarEventos() {
    $('#catalogo-grid')
      .off('click')
      .on('click', '[data-accion="ficha"]', function () {
        var p = POR_ID[$(this).closest('.ksi-card').attr('data-id')];
        if (p) { abrirFicha(p); }
      })
      .on('click', '[data-accion="cotizar"]', function () {
        $('#c-pieza').val($(this).closest('.ksi-card').attr('data-id'));
        tocado.pieza = true;
        refrescar();
        location.hash = '#consulta';
      });

    $('#herramientas')
      .off('input change')
      .on('input', '#buscar', function () {
        estado.q = norm($(this).val().trim().slice(0, 60));
        estado.pagina = 0;
        mostrar();
      })
      .on('change', 'select', function () {
        if (this.id === 'filtro-cat') { estado.cat = $(this).val(); } else { estado.mat = $(this).val(); }
        estado.pagina = 0;
        mostrar();
      });

    $('.ksi-pager')
      .off('click')
      .on('click', '#pager-prev', function () { estado.pagina--; mostrar(); })
      .on('click', '#pager-next', function () { estado.pagina++; mostrar(); });

    var espera = null;
    $(window).off('resize.ksi').on('resize.ksi', function () {
      clearTimeout(espera);
      espera = setTimeout(mostrar, 120);
    });

    $('#cotizador')
      .off('input change focusout submit')
      .on('input change focusout', 'input, select, textarea', function () {
        tocado[$(this).attr('name')] = true;
        refrescar();
      })
      .on('submit', function (e) {
        e.preventDefault();
        var primero = null;
        $.each(CAMPOS, function (clave, validar) {
          tocado[clave] = true;
          if (!primero && validar($('#c-' + clave).val())) { primero = clave; }
        });
        refrescar();
        if (primero) { $('#c-' + primero).trigger('focus'); return; }
        var p = POR_ID[$('#c-pieza').val()];
        var n = Number($('#c-cantidad').val());
        $('#res-texto').text(
          $('#c-nombre').val().trim() + ' solicita ' + n + ' × ' + p.nombre +
          '. Total estimado: ' + precio(p.precio * n) + '. Contacto: ' + $('#c-correo').val().trim() + '.'
        );
        document.getElementById('dlg-resultado').showModal();
      });

    $('.ksi-sheet').off('click').on('click', function (e) {
      var r = this.getBoundingClientRect();
      var fuera = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (fuera) { this.close(); }
    });
  }

  $(function () {
    KSI.vistas('inicio');
    construirFiltros();
    enlazarEventos();
    cargarCatalogo();
    refrescar();
  });

  KSI.registrarSW();
})(jQuery);
