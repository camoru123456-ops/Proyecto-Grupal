/* ==========================================================
   KSI STUDIO – script.js
   PWA + Zero-Scroll + Supabase (con respaldo local offline)
   Requiere (en este orden): jQuery, jQuery UI, Bootstrap, supabase-js@2
   ========================================================== */

/* ---------- 1) CONFIGURACIÓN (Supabase) ---------- */
// Supabase → Project Settings → API
const SUPABASE_URL = "https://meiclhlnfmmjzyedsztz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SDkc22Fq6jBAHivXc2AJMw_eruXxsea";
// WhatsApp del taller en formato internacional, sin "+" (Bolivia = 591)
const NUMERO_WHATSAPP_KSI = "59178426903";

(function ($) {
  "use strict";

  /* ---------- 2) CONSTANTES Y ESTADO ---------- */
  const LS = {
    sesion: "ksi_sesion",
    carrito: "ksi_carrito",
    muebles: "ksi_muebles_local",
    pedidos: "ksi_pedidos_local",
    bitacora: "ksi_bitacora_local"
  };
  const ACABADOS = [
    { id: "Natural Mate", color: "#D9B98A" },
    { id: "Nogal Oscuro", color: "#5A3A1E" },
    { id: "Blanco Melamina", color: "#F4F1EA" }
  ];
  const ESTADOS = ["Pendiente", "En Fabricación", "Entregado"];
  // Respaldo local (modo offline / sin Supabase)
  const USUARIOS_LOCALES = [
    { email: "cliente@ksi.bo", password: "cliente123", nombre: "Cliente Demo", rol: "cliente" },
    { email: "admin@ksi.bo", password: "admin123", nombre: "Administrador KSI", rol: "admin" }
  ];
  const EVENTOS_WEB_DEMO = [
    "Navegación: Usuario exploró catálogo de Salas",
    "Consulta: Revisión de medidas en Escritorio Linea",
    "Interacción: Filtro de precios aplicado en vitrina",
    "Sistema: Sincronización de catálogo completada",
    "Vitrina: Vista previa de acabado Nogal Oscuro"
  ];

  const configuradoSupabase =
    !/TU-PROYECTO/.test(SUPABASE_URL) && !/TU_SUPABASE/.test(SUPABASE_ANON_KEY) && window.supabase;
  const db = configuradoSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  const estado = {
    usuario: null,
    muebles: [],
    origen: "json",          // 'supabase' | 'local' | 'json'
    cat: "Todos",
    busqueda: "",
    pMin: 0,
    pMax: Infinity,
    carrito: [],
    pedidos: [],
    logSesion: [],
    canal: null
  };

  /* ---------- 3) UTILIDADES ---------- */
  const leerLS = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* cuota o modo privado */ } };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bs = (n) => "Bs " + Number(n || 0).toLocaleString("es-BO");
  const pad = (n) => String(n).padStart(2, "0");
  const horaActual = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); };
  const fechaCorta = (iso) => { const d = iso ? new Date(iso) : new Date(); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const normalizar = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = (s) => normalizar(s).replace(/\s+/g, "-");
  const esAdmin = () => estado.usuario && estado.usuario.rol === "admin";
  const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const esStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  function toast(msg, tipo) {
    const $t = $('<div class="ksi-toast"></div>').text(msg).addClass(tipo || "");
    $("#toasts").append($t);
    $t.hide().fadeIn(150).delay(2800).fadeOut(300, function () { $(this).remove(); });
  }

  /* ---------- 4) BITÁCORA (Date API, HH:MM:SS) ---------- */
  async function registrar(tipo, accion) {
    const u = estado.usuario || { email: "anónimo", rol: "—" };
    const reg = { hora: horaActual(), usuario: u.email, rol: u.rol, tipo: tipo, accion: accion };
    estado.logSesion.unshift(Object.assign({ fecha: new Date().toISOString() }, reg));
    estado.logSesion = estado.logSesion.slice(0, 60);
    renderBitacoraCliente();

    let enviado = false;
    if (db && navigator.onLine) {
      try {
        const { error } = await db.from("bitacora").insert(reg);
        if (error) throw error;
        enviado = true;
      } catch (e) { /* se guarda local y se sincroniza luego */ }
    }
    if (!enviado) {
      const l = leerLS(LS.bitacora, []);
      l.unshift(Object.assign({ fecha: new Date().toISOString(), _local: true }, reg));
      guardarLS(LS.bitacora, l.slice(0, 300));
    }
    if (esAdmin() && $("#tab-auditoria").hasClass("activo")) refrescarAuditoria();
  }

  function renderBitacoraCliente() {
    const l = estado.logSesion;
    $("#bitacoraLista").html(
      l.length
        ? l.map((r) => '<li class="log-' + esc(r.tipo) + '"><time>' + esc(r.hora) + "</time><span>" + esc(r.accion) + "</span></li>").join("")
        : '<li class="vacio">Sin eventos recientes en la página web</li>'
    );
    $("#bitacoraConteo").text(l.length);
    $("#bitacoraUltimo").text(l[0] ? l[0].hora + " · " + l[0].accion : "");
  }

  /* ---------- 5) CAPA DE DATOS (Supabase con respaldo local) ---------- */
  async function cargarMuebles() {
    if (db) {
      try {
        const { data, error } = await db.from("muebles").select("*").order("id");
        if (error) throw error;
        if (data && data.length) { estado.muebles = data; estado.origen = "supabase"; return; }
      } catch (e) { console.warn("[KSI] Supabase muebles:", e.message || e); }
    }
    const local = leerLS(LS.muebles, null);
    if (local && local.length) { estado.muebles = local; estado.origen = "local"; return; }
    try {
      const r = await fetch("./muebles.json");
      estado.muebles = await r.json();
      estado.origen = "json";
    } catch (e) { estado.muebles = []; toast("No se pudo cargar el catálogo", "warn"); }
  }

  function payloadMueble(m) {
    return {
      nombre: m.nombre, categoria: m.categoria, precio: Number(m.precio) || 0, stock: parseInt(m.stock, 10) || 0,
      emoji: m.emoji || "🪑", descripcion: m.descripcion || "", medidas: m.medidas || "", material: m.material || "",
      activo: m.activo !== false
    };
  }

  async function persistirMueble(m) {
    const payload = payloadMueble(m);
    if (db && estado.origen === "supabase") {
      try {
        const q = m.id ? db.from("muebles").update(payload).eq("id", m.id) : db.from("muebles").insert(payload);
        const { error } = await q;
        if (error) throw error;
        await cargarMuebles();
        return "supabase";
      } catch (e) { toast("Supabase no respondió: se guardó localmente", "warn"); }
    }
    if (m.id) {
      const i = estado.muebles.findIndex((x) => String(x.id) === String(m.id));
      if (i >= 0) estado.muebles[i] = Object.assign({}, estado.muebles[i], payload);
    } else {
      estado.muebles.push(Object.assign({ id: Date.now() }, payload));
    }
    if (estado.origen === "json") estado.origen = "local";
    guardarLS(LS.muebles, estado.muebles);
    return "local";
  }

  async function borrarMueble(id) {
    if (db && estado.origen === "supabase") {
      try {
        const { error } = await db.from("muebles").delete().eq("id", id);
        if (error) throw error;
        await cargarMuebles();
        return;
      } catch (e) { toast("Supabase no respondió: se eliminó localmente", "warn"); }
    }
    estado.muebles = estado.muebles.filter((x) => String(x.id) !== String(id));
    if (estado.origen === "json") estado.origen = "local";
    guardarLS(LS.muebles, estado.muebles);
  }

  async function sembrarCatalogo() {
    if (!db) return;
    try {
      const r = await fetch("./muebles.json");
      const base = (await r.json()).map(payloadMueble);
      const { error } = await db.from("muebles").insert(base);
      if (error) throw error;
      await cargarMuebles();
      renderCatalogoAdmin();
      toast("Catálogo sembrado en Supabase ✅", "ok");
    } catch (e) { toast("No se pudo sembrar: " + (e.message || e), "warn"); }
  }

  async function crearPedido(p) {
    if (db && navigator.onLine) {
      try {
        const { error } = await db.from("pedidos_cotizaciones").insert(p);
        if (error) throw error;
        return "supabase";
      } catch (e) { console.warn("[KSI] pedido offline:", e.message || e); }
    }
    const l = leerLS(LS.pedidos, []);
    l.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString(), _local: true }, p));
    guardarLS(LS.pedidos, l);
    return "local";
  }

  async function cargarPedidos() {
    let lista = [];
    if (db) {
      try {
        const { data, error } = await db.from("pedidos_cotizaciones").select("*").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        lista = data || [];
      } catch (e) { console.warn("[KSI] pedidos:", e.message || e); }
    }
    estado.pedidos = lista.concat(leerLS(LS.pedidos, []));
  }

  async function cambiarEstadoPedido(id, nuevo) {
    const local = leerLS(LS.pedidos, []);
    const i = local.findIndex((p) => String(p.id) === String(id));
    if (i >= 0) { local[i].estado = nuevo; guardarLS(LS.pedidos, local); return; }
    if (db) {
      const { error } = await db.from("pedidos_cotizaciones").update({ estado: nuevo }).eq("id", id);
      if (error) throw error;
    }
  }

  async function cargarBitacoraAdmin() {
    let lista = [];
    if (db) {
      try {
        const { data, error } = await db.from("bitacora").select("*").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        lista = data || [];
      } catch (e) { console.warn("[KSI] bitácora:", e.message || e); }
    }
    return lista.concat(leerLS(LS.bitacora, [])).sort((a, b) => new Date(b.created_at || b.fecha) - new Date(a.created_at || a.fecha));
  }

  // Sube a Supabase lo que se guardó sin conexión
  async function sincronizar() {
    if (!db || !navigator.onLine) return;
    const lb = leerLS(LS.bitacora, []).filter((x) => x._local);
    if (lb.length) {
      try {
        const { error } = await db.from("bitacora").insert(lb.map((r) => ({ hora: r.hora, usuario: r.usuario, rol: r.rol, tipo: r.tipo, accion: r.accion })));
        if (!error) guardarLS(LS.bitacora, []);
      } catch (e) { /* reintenta luego */ }
    }
    const lp = leerLS(LS.pedidos, []).filter((x) => x._local);
    if (lp.length) {
      try {
        const rows = lp.map((p) => ({ cliente_nombre: p.cliente_nombre, cliente_telefono: p.cliente_telefono, cliente_email: p.cliente_email, items: p.items, total: p.total, medidas: p.medidas, notas: p.notas, estado: p.estado }));
        const { error } = await db.from("pedidos_cotizaciones").insert(rows);
        if (!error) { guardarLS(LS.pedidos, []); toast("Pedidos guardados offline sincronizados ✅", "ok"); }
      } catch (e) { /* reintenta luego */ }
    }
  }

  /* ---------- 6) LOGIN / SESIÓN ---------- */
  async function validarLogin(email, pass) {
    email = email.trim().toLowerCase();
    if (db && navigator.onLine) {
      try {
        const { data, error } = await db.from("usuarios").select("email,nombre,rol").eq("email", email).eq("password", pass).maybeSingle();
        if (error) throw error;
        return data ? { email: data.email, nombre: data.nombre, rol: data.rol === "admin" ? "admin" : "cliente" } : null;
      } catch (e) { console.warn("[KSI] login Supabase falló, uso respaldo local:", e.message || e); }
    }
    const u = USUARIOS_LOCALES.find((x) => x.email === email && x.password === pass);
    return u ? { email: u.email, nombre: u.nombre, rol: u.rol } : null;
  }

  function mostrarLogin() {
    $("#vista-cliente, #vista-admin").prop("hidden", true);
    $("#vista-login").prop("hidden", false);
    $("#userChip, #btnLogout").prop("hidden", true);
    $("#loginError").prop("hidden", true);
    $("#formLogin")[0].reset();
    $("#modoDatos").text(db ? "● Conectado a Supabase" : "● Modo demostración offline (sin claves de Supabase)");
  }

  async function iniciarApp() {
    const u = estado.usuario;
    $("#vista-login").prop("hidden", true);
    $("#userChip").text((u.rol === "admin" ? "🛠️ " : "👤 ") + (u.nombre || u.email)).prop("hidden", false);
    $("#btnLogout").prop("hidden", false);
    await cargarMuebles();

   if (esAdmin()) {
      $("#vista-cliente").prop("hidden", true);
      $("#vista-admin").prop("hidden", false);
      activarTab("admin", "catalogo");
      limpiarFormMueble();
      renderCatalogoAdmin();
      $("#bitacora").toggleClass("collapsed", window.innerWidth < 768);
      renderBitacoraCliente();
      suscribirRealtime();
      cargarPedidos().then(actualizarBadgePedidos);
    } else {
      $("#vista-admin").prop("hidden", true);
      $("#vista-cliente").prop("hidden", false);
      estado.carrito = leerLS(LS.carrito, []);
      activarTab("cliente", "vitrina");
      configurarSlider();
      renderVitrina(true);
      renderCarrito();
      $("#pNombre").val(u.nombre || "");
    }
    registrar(esAdmin() ? "admin" : "cliente", "Inició sesión (" + u.rol + ")");
    sincronizar();
  }

  function cerrarSesion() {
    registrar(esAdmin() ? "admin" : "cliente", "Cerró sesión");
    if (db && estado.canal) { db.removeChannel(estado.canal); estado.canal = null; }
    estado.usuario = null;
    estado.logSesion = [];
    try { localStorage.removeItem(LS.sesion); } catch (e) { /* noop */ }
    mostrarLogin();
  }

  /* ---------- 7) NAVEGACIÓN POR PESTAÑAS ---------- */
  function activarTab(vista, tab) {
    const $v = $("#vista-" + vista);
    $v.find(".ksi-nav [data-tab]").removeClass("activo").attr("aria-selected", "false")
      .filter('[data-tab="' + tab + '"]').addClass("activo").attr("aria-selected", "true");
    $v.find(".panel").removeClass("activo");
    $("#tab-" + tab).addClass("activo");

    if (tab === "pedidos") refrescarPedidos();
    if (tab === "auditoria") refrescarAuditoria();
    if (tab === "cotizacion") renderCarrito();
  }

  /* ---------- 8) CLIENTE: VITRINA ---------- */
  function visibles() { return estado.muebles.filter((m) => m.activo !== false); }

  function filtrados() {
    const q = normalizar(estado.busqueda);
    return visibles().filter((m) =>
      (estado.cat === "Todos" || m.categoria === estado.cat) &&
      Number(m.precio) >= estado.pMin && Number(m.precio) <= estado.pMax &&
      (!q || normalizar(m.nombre + " " + m.descripcion + " " + m.categoria).includes(q))
    );
  }

  function tarjetaHTML(m) {
    const bajo = Number(m.stock) <= 0;
    return '<article class="mueble-card cat-' + slug(m.categoria) + '" data-accion="detalle" data-id="' + esc(m.id) + '" tabindex="0" aria-label="Ver detalle de ' + esc(m.nombre) + '">' +
      '<div class="mc-visual" aria-hidden="true">' + esc(m.emoji || "🪑") + "</div>" +
      '<div class="mc-body">' +
      '<span class="mc-cat">' + esc(m.categoria) + "</span>" +
      '<h3 class="mc-nombre">' + esc(m.nombre) + "</h3>" +
      '<span class="mc-precio">' + (m.categoria === "A Medida" ? "Desde " : "") + bs(m.precio) + "</span>" +
      '<span class="mc-stock ' + (bajo ? "bajo" : "") + '">' + (bajo ? "Fabricación bajo pedido" : m.stock + " en taller") + "</span>" +
      '<div class="mc-acciones">' +
      '<button type="button" class="btn-mini" data-accion="detalle" data-id="' + esc(m.id) + '">Ver</button>' +
      '<button type="button" class="btn-mini primario" data-accion="agregar-rapido" data-id="' + esc(m.id) + '">+ Cotizar</button>' +
      "</div></div></article>";
  }

  function renderVitrina(animar) {
    const lista = filtrados();
    const $g = $("#gridMuebles");
    $g.html(lista.length ? lista.map(tarjetaHTML).join("") : '<div class="vacio-estado">😕 No encontramos muebles con esos filtros.</div>');
    if (animar) $g.children().hide().each(function (i) { $(this).delay(i * 35).fadeIn(220); });
    $("#contador").text(lista.length + (lista.length === 1 ? " mueble" : " muebles"));
  }

  function configurarSlider() {
    const precios = visibles().map((m) => Number(m.precio) || 0);
    const max = Math.max(500, Math.ceil(Math.max.apply(null, precios.concat([0])) / 100) * 100);
    estado.pMin = 0; estado.pMax = max;
    const $s = $("#sliderPrecio");
    if ($s.hasClass("ui-slider")) $s.slider("destroy");
    $("#precioLbl").text(bs(0) + " – " + bs(max));
    $s.slider({
      range: true, min: 0, max: max, step: 50, values: [0, max],
      slide: function (e, ui) {
        estado.pMin = ui.values[0]; estado.pMax = ui.values[1];
        $("#precioLbl").text(bs(ui.values[0]) + " – " + bs(ui.values[1]));
        renderVitrina(false);
      },
      stop: function (e, ui) { registrar("cliente", "Filtró precio " + bs(ui.values[0]) + " – " + bs(ui.values[1])); }
    });
  }

  /* ---------- 9) CLIENTE: DETALLE (jQuery UI Dialog) ---------- */
  function abrirDetalle(id) {
    const m = estado.muebles.find((x) => String(x.id) === String(id));
    if (!m) return;
    registrar("cliente", "Abrió detalle: " + m.nombre);

    const acabados = ACABADOS.map((a, i) =>
      '<div class="acabado-op"><input type="radio" name="acabado" id="ac' + i + '" value="' + esc(a.id) + '"' + (i === 0 ? " checked" : "") + ">" +
      '<label for="ac' + i + '"><span class="sw" style="background:' + a.color + '"></span>' + esc(a.id) + "</label></div>").join("");

    const html =
      '<div class="dlg-visual cat-' + slug(m.categoria) + '" aria-hidden="true">' + esc(m.emoji || "🪑") + "</div>" +
      '<div class="dlg-precio">' + (m.categoria === "A Medida" ? "Desde " : "") + bs(m.precio) + "</div>" +
      '<p class="mb-1">' + esc(m.descripcion) + "</p>" +
      '<ul class="dlg-specs">' +
      "<li><span>Categoría</span><span>" + esc(m.categoria) + "</span></li>" +
      "<li><span>Medidas</span><span>" + esc(m.medidas || "—") + "</span></li>" +
      "<li><span>Material</span><span>" + esc(m.material || "—") + "</span></li>" +
      "<li><span>Disponibilidad</span><span>" + (Number(m.stock) > 0 ? m.stock + " en taller" : "Bajo pedido") + "</span></li></ul>" +
      '<strong style="font-size:.8rem">Acabado de madera</strong><div class="acabados">' + acabados + "</div>" +
      '<label for="dlgCant" class="form-label">Cantidad</label>' +
      '<input id="dlgCant" type="number" min="1" max="20" value="1" class="form-control form-control-sm" style="max-width:90px">';

    $("#dlgDetalle").html(html).dialog({
      modal: true, title: m.nombre, resizable: false, draggable: false,
      width: Math.min(480, $(window).width() - 20),
      classes: { "ui-dialog": "ksi-dialog" },
      show: { effect: "fade", duration: 150 }, hide: { effect: "fade", duration: 100 },
      buttons: [
        {
          text: "Agregar a cotización",
          click: function () {
            const acabado = $('#dlgDetalle input[name="acabado"]:checked').val() || ACABADOS[0].id;
            const cant = Math.min(20, Math.max(1, parseInt($("#dlgCant").val(), 10) || 1));
            agregarAlCarrito(m.id, acabado, cant);
            $(this).dialog("close");
          }
        },
        { text: "Cerrar", click: function () { $(this).dialog("close"); } }
      ],
      close: function () { $(this).dialog("destroy"); }
    });
  }

  /* ---------- 10) CLIENTE: CARRITO DE COTIZACIÓN ---------- */
  function guardarCarrito() { guardarLS(LS.carrito, estado.carrito); renderCarrito(); }

  function agregarAlCarrito(id, acabado, cant) {
    const m = estado.muebles.find((x) => String(x.id) === String(id));
    if (!m) return;
    const clave = m.id + "|" + acabado;
    const ex = estado.carrito.find((i) => i.clave === clave);
    if (ex) ex.cant += cant;
    else estado.carrito.push({ clave: clave, id: m.id, nombre: m.nombre, emoji: m.emoji || "🪑", categoria: m.categoria, precio: Number(m.precio), acabado: acabado, cant: cant });
    guardarCarrito();
    registrar("cliente", "Agregó " + cant + " × " + m.nombre + " (" + acabado + ")");
    toast("✔ " + m.nombre + " agregado a tu cotización", "ok");
  }

  function renderCarrito() {
    const c = estado.carrito;
    const unidades = c.reduce((s, i) => s + i.cant, 0);
    const total = c.reduce((s, i) => s + i.precio * i.cant, 0);
    $("#badgeCarrito").text(unidades).prop("hidden", !unidades);
    $("#carritoTotal").text(bs(total));

    $("#listaCarrito").html(c.length
      ? c.map((i) =>
        '<div class="item-cot"><div class="ic-emoji">' + esc(i.emoji) + "</div>" +
        '<div><div class="ic-nombre">' + esc(i.nombre) + '</div><div class="ic-acabado">' + esc(i.acabado) + " · " + bs(i.precio) + " c/u</div>" +
        '<div class="ic-ctrl"><button type="button" class="btn-icon" data-accion="cant-menos" data-clave="' + esc(i.clave) + '" aria-label="Menos">−</button>' +
        "<span>" + i.cant + '</span><button type="button" class="btn-icon" data-accion="cant-mas" data-clave="' + esc(i.clave) + '" aria-label="Más">+</button></div></div>' +
        '<div><div class="ic-precio">' + bs(i.precio * i.cant) + '</div><button type="button" class="ic-quitar" data-accion="quitar" data-clave="' + esc(i.clave) + '">Quitar</button></div></div>').join("")
      : '<div class="estado-vacio">Aún no agregaste muebles.<br><button type="button" class="btn-mini mt-2" data-accion="tab" data-vista="cliente" data-tab="vitrina">Ir a la vitrina</button></div>');

    const aMedida = c.some((i) => i.categoria === "A Medida");
    $("#pMedidas").prop("required", aMedida);
    $("#medidasHint").text(aMedida ? "(obligatorio: hay muebles a medida)" : "(opcional)");
  }

  function mensajeWhatsApp(d, total) {
    const lineas = estado.carrito.map((i) => "• " + i.cant + " × " + i.nombre + " (" + i.acabado + ") — " + bs(i.precio * i.cant));
    return ["*Nueva cotización – KSI STUDIO*", "", "Cliente: " + d.nombre, "Celular: " + d.telefono, "", "*Detalle*"]
      .concat(lineas)
      .concat(["", "*Total estimado: " + bs(total) + "*", d.medidas ? "Medidas: " + d.medidas : "", d.notas ? "Notas: " + d.notas : ""])
      .filter((l, idx, arr) => !(l === "" && arr[idx - 1] === ""))
      .join("\n");
  }

  async function enviarPedido(form) {
    if (!estado.carrito.length) { toast("Tu cotización está vacía", "warn"); return; }
    $(form).addClass("was-validated");
    if (!form.checkValidity()) { toast("Revisa los campos marcados", "warn"); return; }

    const d = {
      nombre: $("#pNombre").val().trim(), telefono: $("#pTelefono").val().trim(),
      medidas: $("#pMedidas").val().trim(), notas: $("#pNotas").val().trim()
    };
    const total = estado.carrito.reduce((s, i) => s + i.precio * i.cant, 0);
    const msg = mensajeWhatsApp(d, total);

    // Se abre WhatsApp de inmediato (antes de cualquier await) para evitar bloqueo de ventanas emergentes
    if (/X{4,}/.test(NUMERO_WHATSAPP_KSI)) toast("Configura NUMERO_WHATSAPP_KSI en script.js", "warn");
    window.open("https://wa.me/" + NUMERO_WHATSAPP_KSI + "?text=" + encodeURIComponent(msg), "_blank", "noopener");

    const modo = await crearPedido({
      cliente_nombre: d.nombre, cliente_telefono: d.telefono, cliente_email: estado.usuario.email,
      items: estado.carrito.map((i) => ({ id: i.id, nombre: i.nombre, acabado: i.acabado, cant: i.cant, precio: i.precio })),
      total: total, medidas: d.medidas, notas: d.notas, estado: "Pendiente"
    });
    registrar("cliente", "Envió cotización por " + bs(total) + " (" + (modo === "supabase" ? "guardada en Supabase" : "guardada offline") + ")");
    toast(modo === "supabase" ? "Cotización guardada ✅" : "Sin conexión: guardada en tu dispositivo ✅", "ok");

    estado.carrito = [];
    guardarCarrito();
    form.reset();
    $(form).removeClass("was-validated");
    $("#pNombre").val(estado.usuario.nombre || "");
  }

  /* ---------- 11) ADMIN: CATÁLOGO (CRUD) ---------- */
  function renderCatalogoAdmin() {
    $("#avisoSembrar").prop("hidden", !(db && estado.origen !== "supabase"));
    const filas = estado.muebles.map((m) =>
      "<tr><td>" + esc(m.emoji || "🪑") + " <strong>" + esc(m.nombre) + "</strong></td>" +
      "<td>" + esc(m.categoria) + "</td>" +
      '<td><input type="number" min="0" step="10" class="form-control inline-edit" data-id="' + esc(m.id) + '" data-campo="precio" value="' + Number(m.precio) + '" aria-label="Precio de ' + esc(m.nombre) + '"></td>' +
      '<td><input type="number" min="0" step="1" class="form-control inline-edit" data-id="' + esc(m.id) + '" data-campo="stock" value="' + Number(m.stock) + '" aria-label="Stock de ' + esc(m.nombre) + '"></td>' +
      '<td><span class="etiqueta ' + (m.activo !== false ? "ok" : "off") + '">' + (m.activo !== false ? "Visible" : "Oculto") + "</span></td>" +
      '<td class="acciones">' +
      '<button type="button" class="btn-mini" data-accion="editar-mueble" data-id="' + esc(m.id) + '">Editar</button> ' +
      '<button type="button" class="btn-mini" data-accion="toggle-mueble" data-id="' + esc(m.id) + '">' + (m.activo !== false ? "Desactivar" : "Activar") + "</button> " +
      '<button type="button" class="btn-mini" style="color:#B91C1C" data-accion="eliminar-mueble" data-id="' + esc(m.id) + '">Eliminar</button></td></tr>').join("");
    $("#tbodyMuebles").html(filas || '<tr><td colspan="6" class="text-center text-muted py-3">Sin muebles</td></tr>');
  }

  function limpiarFormMueble() {
    const f = $("#formMueble")[0];
    f.reset();
    $("#fId").val("");
    $("#fEmoji").val("🪑");
    $("#fStock").val(0);
    $("#fActivo").prop("checked", true);
    $(f).removeClass("was-validated");
    $("#formMuebleTitulo").text("➕ Nuevo mueble");
  }

  function editarMueble(id) {
    const m = estado.muebles.find((x) => String(x.id) === String(id));
    if (!m) return;
    $("#fId").val(m.id); $("#fNombre").val(m.nombre); $("#fEmoji").val(m.emoji || "🪑");
    $("#fCategoria").val(m.categoria); $("#fPrecio").val(m.precio); $("#fStock").val(m.stock);
    $("#fMedidas").val(m.medidas || ""); $("#fMaterial").val(m.material || ""); $("#fDescripcion").val(m.descripcion || "");
    $("#fActivo").prop("checked", m.activo !== false);
    $("#formMuebleTitulo").text("✏️ Editando: " + m.nombre);
    $("#fNombre").trigger("focus");
  }

  async function guardarFormMueble(form) {
    $(form).addClass("was-validated");
    if (!form.checkValidity()) { toast("Revisa los campos marcados", "warn"); return; }
    const id = $("#fId").val();
    const m = {
      id: id || null, nombre: $("#fNombre").val().trim(), emoji: $("#fEmoji").val().trim() || "🪑",
      categoria: $("#fCategoria").val(), precio: $("#fPrecio").val(), stock: $("#fStock").val(),
      medidas: $("#fMedidas").val().trim(), material: $("#fMaterial").val().trim(),
      descripcion: $("#fDescripcion").val().trim(), activo: $("#fActivo").is(":checked")
    };
    await persistirMueble(m);
    registrar("admin", (id ? "Editó" : "Creó") + " mueble: " + m.nombre + " (" + bs(m.precio) + ", stock " + m.stock + ")");
    toast(id ? "Mueble actualizado ✅" : "Mueble creado ✅", "ok");
    limpiarFormMueble();
    renderCatalogoAdmin();
  }

  /* ---------- 12) ADMIN: PEDIDOS ---------- */
  function telWhatsApp(t) {
    const n = String(t || "").replace(/\D/g, "");
    return n.length <= 8 ? "591" + n : n;
  }
  const claseEstado = (e) => (e === "Entregado" ? "est-entregado" : e === "En Fabricación" ? "est-fabricacion" : "est-pendiente");

  function actualizarBadgePedidos() {
    const n = estado.pedidos.filter((p) => p.estado === "Pendiente").length;
    $("#badgePedidos").text(n).prop("hidden", !n);
  }

  function renderPedidos() {
    const filas = estado.pedidos.map((p) => {
      const items = (Array.isArray(p.items) ? p.items : []).map((i) => i.cant + "× " + i.nombre + " (" + i.acabado + ")").join(", ");
      const wa = "https://wa.me/" + telWhatsApp(p.cliente_telefono) + "?text=" +
        encodeURIComponent("Hola " + (p.cliente_nombre || "") + ", te escribimos de KSI STUDIO sobre tu cotización #" + p.id + ".");
      return "<tr><td>" + esc(p.id) + "</td><td>" + esc(fechaCorta(p.created_at)) + "</td>" +
        "<td><strong>" + esc(p.cliente_nombre) + "</strong><br><small>" + esc(p.cliente_telefono) + "</small></td>" +
        '<td class="det-items">' + esc(items) + (p.medidas ? "<br><em>Medidas: " + esc(p.medidas) + "</em>" : "") + (p.notas ? "<br><em>Notas: " + esc(p.notas) + "</em>" : "") + "</td>" +
        "<td><strong>" + bs(p.total) + "</strong></td>" +
        '<td><select class="form-select form-select-sm sel-estado ' + claseEstado(p.estado) + '" data-id="' + esc(p.id) + '" aria-label="Estado del pedido ' + esc(p.id) + '">' +
        ESTADOS.map((e) => '<option' + (e === p.estado ? " selected" : "") + ">" + e + "</option>").join("") + "</select></td>" +
        '<td><a class="btn-wa" data-accion="wa-cliente" data-id="' + esc(p.id) + '" href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a></td></tr>';
    }).join("");
    $("#tbodyPedidos").html(filas || '<tr><td colspan="7" class="text-center text-muted py-4">Aún no hay solicitudes.</td></tr>');
    actualizarBadgePedidos();
  }

  async function refrescarPedidos() { await cargarPedidos(); renderPedidos(); }

  /* ---------- 13) ADMIN: AUDITORÍA ---------- */
  async function refrescarAuditoria() {
    const lista = await cargarBitacoraAdmin();
    $("#tbodyAudit").html(lista.slice(0, 250).map((r) =>
      "<tr><td><strong>" + esc(r.hora) + "</strong></td><td>" + esc(fechaCorta(r.created_at || r.fecha)) + "</td>" +
      "<td>" + esc(r.usuario) + '</td><td><span class="etiqueta ' + (r.rol === "admin" ? "admin" : "cliente") + '">' + esc(r.rol) + "</span></td>" +
      '<td><span class="etiqueta ' + (r.tipo === "web" ? "tiktok" : r.tipo === "admin" ? "admin" : "cliente") + '">' + esc(r.tipo) + "</span></td>" +
      "<td>" + esc(r.accion) + "</td></tr>").join("") ||
      '<tr><td colspan="6" class="text-center text-muted py-4">Sin registros todavía.</td></tr>');
  }

  /* Tiempo real: Supabase Realtime (y evento "storage" para modo local) */
  function suscribirRealtime() {
    if (db && !estado.canal) {
      try {
        estado.canal = db.channel("ksi-admin")
          .on("postgres_changes", { event: "*", schema: "public", table: "pedidos_cotizaciones" }, () => {
            if ($("#tab-pedidos").hasClass("activo")) refrescarPedidos();
            else { cargarPedidos().then(actualizarBadgePedidos); toast("📥 Movimiento en pedidos"); }
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "bitacora" }, () => {
            if ($("#tab-auditoria").hasClass("activo")) refrescarAuditoria();
          })
          .subscribe();
      } catch (e) { console.warn("[KSI] realtime:", e.message || e); }
    }
  }
  window.addEventListener("storage", (e) => {
    if (!esAdmin()) return;
    if (e.key === LS.pedidos && $("#tab-pedidos").hasClass("activo")) refrescarPedidos();
    if (e.key === LS.bitacora && $("#tab-auditoria").hasClass("activo")) refrescarAuditoria();
  });

  /* ---------- 14) DELEGACIÓN DE EVENTOS (un solo manejador de clics) ---------- */
  $(document).on("click", "[data-accion]", function (e) {
    const $el = $(e.target).closest("[data-accion]");
    const accion = $el.data("accion");
    const id = $el.data("id");
    const clave = $el.data("clave");

    switch (accion) {
      case "login-demo":
        $("#loginEmail").val($el.data("email"));
        $("#loginPass").val($el.data("pass"));
        $("#formLogin").trigger("submit");
        break;
      case "logout": cerrarSesion(); break;
      case "instalar": instalarApp(); break;

      case "tab":
        activarTab($el.data("vista"), $el.data("tab"));
        registrar(esAdmin() ? "admin" : "cliente", "Abrió pestaña: " + $el.data("tab"));
        break;

      case "filtro":
        estado.cat = $el.data("cat");
        $(".chip").removeClass("activo");
        $el.addClass("activo");
        renderVitrina(true);
        registrar("cliente", "Filtró categoría: " + estado.cat);
        break;
      case "detalle": abrirDetalle(id); break;
      case "agregar-rapido": agregarAlCarrito(id, ACABADOS[0].id, 1); break;

      case "cant-mas":
      case "cant-menos": {
        const it = estado.carrito.find((i) => i.clave === clave);
        if (it) {
          it.cant = Math.max(1, Math.min(20, it.cant + (accion === "cant-mas" ? 1 : -1)));
          guardarCarrito();
          registrar("cliente", "Cambió cantidad de " + it.nombre + " a " + it.cant);
        }
        break;
      }
      case "quitar": {
        const it = estado.carrito.find((i) => i.clave === clave);
        estado.carrito = estado.carrito.filter((i) => i.clave !== clave);
        guardarCarrito();
        if (it) registrar("cliente", "Quitó de la cotización: " + it.nombre);
        break;
      }
      case "vaciar-carrito":
        if (estado.carrito.length) { estado.carrito = []; guardarCarrito(); registrar("cliente", "Vació la cotización"); }
        break;

      case "toggle-bitacora": {
        const $b = $("#bitacora").toggleClass("collapsed");
        $el.attr("aria-expanded", String(!$b.hasClass("collapsed")));
        break;
      }
      case "web-sim":
        registrar("web", "Bitácora Web › " + EVENTOS_WEB_DEMO[Math.floor(Math.random() * EVENTOS_WEB_DEMO.length)]);
        break;

      case "nuevo-mueble": limpiarFormMueble(); break;
      case "editar-mueble": editarMueble(id); break;
      case "toggle-mueble": {
        const m = estado.muebles.find((x) => String(x.id) === String(id));
        if (m) {
          persistirMueble(Object.assign({}, m, { activo: m.activo === false })).then(() => {
            registrar("admin", (m.activo === false ? "Activó" : "Desactivó") + " mueble: " + m.nombre);
            renderCatalogoAdmin();
          });
        }
        break;
      }
      case "eliminar-mueble": {
        const m = estado.muebles.find((x) => String(x.id) === String(id));
        if (m && window.confirm("¿Eliminar definitivamente “" + m.nombre + "”?")) {
          borrarMueble(id).then(() => { registrar("admin", "Eliminó mueble: " + m.nombre); renderCatalogoAdmin(); });
        }
        break;
      }
      case "sembrar": sembrarCatalogo(); break;
      case "refrescar-pedidos": refrescarPedidos(); break;
      case "refrescar-audit": refrescarAuditoria(); break;
      case "wa-cliente": registrar("admin", "Contactó por WhatsApp al pedido #" + id); break; // el enlace sigue su curso
      default: break;
    }
  });

  // Edición en línea de precio / stock (catálogo admin)
  $(document).on("change", ".inline-edit", async function () {
    const $i = $(this);
    const m = estado.muebles.find((x) => String(x.id) === String($i.data("id")));
    const valor = Math.max(0, Number($i.val()) || 0);
    if (!m) return;
    await persistirMueble(Object.assign({}, m, { [$i.data("campo")]: valor }));
    registrar("admin", "Actualizó " + $i.data("campo") + " de " + m.nombre + " → " + valor);
    toast("Guardado ✔", "ok");
    renderCatalogoAdmin();
  });

  // Cambio de estado de pedido
  $(document).on("change", ".sel-estado", async function () {
    const $s = $(this);
    const id = $s.data("id");
    const nuevo = $s.val();
    try {
      await cambiarEstadoPedido(id, nuevo);
      $s.removeClass("est-pendiente est-fabricacion est-entregado").addClass(claseEstado(nuevo));
      const p = estado.pedidos.find((x) => String(x.id) === String(id));
      if (p) p.estado = nuevo;
      actualizarBadgePedidos();
      registrar("admin", "Pedido #" + id + " → " + nuevo);
    } catch (err) { toast("No se pudo cambiar el estado", "warn"); refrescarPedidos(); }
  });

  // Teclado: Enter sobre una tarjeta
  $(document).on("keydown", ".mueble-card", function (e) {
    if (e.key === "Enter" && e.target === this) { e.preventDefault(); abrirDetalle($(this).data("id")); }
  });

  // Teclado: ← → entre pestañas
  $(document).on("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if ($(e.target).is("input, textarea, select, [contenteditable]") || $(e.target).closest(".ui-slider").length) return;
    if ($(".ui-dialog:visible").length || $(".modal.show").length) return;
    const $tabs = $(".vista:not([hidden]) .ksi-nav [data-tab]");
    if (!$tabs.length) return;
    const i = $tabs.index($tabs.filter(".activo"));
    const n = (i + (e.key === "ArrowRight" ? 1 : -1) + $tabs.length) % $tabs.length;
    $tabs.eq(n).trigger("click").trigger("focus");
  });

  /* ---------- 15) FORMULARIOS Y BUSCADOR ---------- */
  $("#formLogin").on("submit", async function (e) {
    e.preventDefault();
    const email = $("#loginEmail").val();
    const pass = $("#loginPass").val();
    const $err = $("#loginError").prop("hidden", true);
    if (!email || !pass) { $err.text("Ingresa tu correo y contraseña.").prop("hidden", false); return; }

    const $btn = $("#btnLogin").prop("disabled", true).text("Verificando...");
    const u = await validarLogin(email, pass);
    $btn.prop("disabled", false).text("Ingresar");
    if (!u) {
      $err.text("Credenciales inválidas." + (db ? " (¿ejecutaste el SQL de la tabla usuarios?)" : "")).prop("hidden", false);
      return;
    }
    estado.usuario = u;
    guardarLS(LS.sesion, u); // persistencia de sesión
    iniciarApp();
  });

  $("#formPedido").on("submit", function (e) { e.preventDefault(); enviarPedido(this); });
  $("#formMueble").on("submit", function (e) { e.preventDefault(); guardarFormMueble(this); });

  $("#formBitacoraWeb").on("submit", function (e) {
    e.preventDefault();
    const txt = $("#bitacoraWebInput").val().trim();
    if (!txt) return;
    registrar("web", "Bitácora Web › " + txt);
    $("#bitacoraWebInput").val("");
  });

  $("#buscador")
    .on("input", function () { estado.busqueda = $(this).val(); renderVitrina(false); })
    .on("change", function () { if ($(this).val().trim()) registrar("cliente", "Buscó: " + $(this).val().trim()); });

  /* ---------- 16) PWA: INSTALACIÓN, OFFLINE Y SERVICE WORKER ---------- */
  let promptInstalacion = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptInstalacion = e;
    $("#btnInstalar").prop("hidden", false);
  });
  window.addEventListener("appinstalled", () => {
    promptInstalacion = null;
    $("#btnInstalar").prop("hidden", true);
    toast("¡KSI STUDIO instalada! 🎉", "ok");
    registrar(esAdmin() ? "admin" : "cliente", "Instaló la app (PWA)");
  });

  async function instalarApp() {
    if (promptInstalacion) {
      promptInstalacion.prompt();
      const r = await promptInstalacion.userChoice;
      registrar(esAdmin() ? "admin" : "cliente", "Instalación PWA: " + r.outcome);
      promptInstalacion = null;
      $("#btnInstalar").prop("hidden", true);
    } else if (esIOS()) {
      new bootstrap.Modal(document.getElementById("modalIOS")).show();
    } else {
      toast("Usa el menú del navegador → “Instalar aplicación”.");
    }
  }

  function actualizarRed() {
    const on = navigator.onLine;
    $("#estadoRed").toggleClass("online", on).toggleClass("offline", !on).text(on ? "● En línea" : "● Sin conexión");
  }
  window.addEventListener("online", () => { actualizarRed(); toast("Conexión restablecida", "ok"); sincronizar(); });
  window.addEventListener("offline", () => { actualizarRed(); toast("Sin conexión: la app sigue funcionando", "warn"); });

  // Service Worker (solo HTTPS o localhost → GitHub Pages cumple)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .then((reg) => console.log("[KSI] Service Worker activo:", reg.scope))
        .catch((err) => console.warn("[KSI] Service Worker falló:", err));
    });
  }

  /* ---------- 17) ARRANQUE ---------- */
  $(function () {
    actualizarRed();
    if (esIOS() && !esStandalone()) $("#btnInstalar").prop("hidden", false);

    const s = leerLS(LS.sesion, null);
    if (s && s.email && (s.rol === "admin" || s.rol === "cliente")) {
      estado.usuario = s;
      iniciarApp();
    } else {
      mostrarLogin();
    }
  });
})(jQuery);
