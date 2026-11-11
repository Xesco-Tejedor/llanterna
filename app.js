/* Llanterna — lógica de la aplicación */
'use strict';

/* ================= utilidades ================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function normaliza(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function ahoraISO() { return new Date().toISOString(); }
function fechaCorta(iso) { return iso ? String(iso).slice(0, 10) : ''; }

/* ================= pestañas ================= */
$$('.pestana').forEach(b => b.addEventListener('click', () => {
  $$('.pestana').forEach(x => { x.classList.toggle('activa', x === b); x.setAttribute('aria-selected', x === b); });
  $$('.vista').forEach(v => v.classList.remove('activa'));
  $('#vista-' + b.dataset.vista).classList.add('activa');
  if (b.dataset.vista === 'casos') pintarCasos();
}));

/* ================= almacén local ================= */
const CLAVE = 'llanterna.casos.v1';
function leerCasos() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { return []; }
}
function guardarCasos(casos) { localStorage.setItem(CLAVE, JSON.stringify(casos)); }
function casoPorId(id) { return leerCasos().find(c => c.id === id); }
function actualizarContador() {
  const n = leerCasos().length;
  const el = $('#contadorCasos');
  el.hidden = n === 0;
  el.textContent = n;
}

/* ================= comunidades / provincias ================= */
(function rellenarComunidades() {
  const sel = $('#fComunidad');
  COMUNIDADES.forEach(([cod, nom]) => {
    const o = document.createElement('option');
    o.value = cod; o.textContent = nom;
    sel.appendChild(o);
  });
})();

$('#fComunidad').addEventListener('change', async e => {
  const cod = e.target.value;
  const prov = $('#fProvincia');
  prov.innerHTML = '<option value="">Todas</option>';
  prov.disabled = true;
  if (!cod) return;
  try {
    const lista = await cargarProvincias(cod);
    lista.forEach(p => {
      const o = document.createElement('option');
      o.value = p.codigo; o.textContent = p.nombre; o.dataset.nombre = p.nombre;
      prov.appendChild(o);
    });
    prov.disabled = false;
  } catch (err) {
    prov.innerHTML = '<option value="">(no se pudieron cargar)</option>';
  }
});

/* ================= estado de búsqueda ================= */
const FUENTES = [
  { id: 'CNDES', nombre: 'CNDES · España', oficial: true },
  { id: 'INTERPOL', nombre: 'Interpol', oficial: true },
  { id: 'PRENSA', nombre: 'Prensa (GDELT)', oficial: false },
  { id: 'WIKIDATA', nombre: 'Wikidata', oficial: false }
];
let ultimaBusqueda = null;   // {q, resultadosPorFuente: {id: {estado, datos|error}}}
let fuenteAbierta = null;
let paginaAlertas = { start: 0, max: 48 };

function leerFormulario() {
  const comSel = $('#fComunidad');
  const provSel = $('#fProvincia');
  return {
    nombre: $('#fNombre').value.trim(),
    ap1: $('#fAp1').value.trim(),
    ap2: $('#fAp2').value.trim(),
    tipo: $('#fTipo').value,
    sexo: $('#fSexo').value,
    edad: $('#fEdad').value,
    comunidad: comSel.value,
    comunidadNombre: comSel.value ? comSel.options[comSel.selectedIndex].textContent : '',
    provincia: provSel.value,
    provinciaNombre: provSel.value ? provSel.options[provSel.selectedIndex].textContent : '',
    anio: $('#fAnio').value.trim()
  };
}

/* ================= búsqueda ================= */
$('#formBusqueda').addEventListener('submit', e => {
  e.preventDefault();
  const q = leerFormulario();
  if (!q.nombre && !q.ap1 && !q.ap2 && !q.sexo && !q.edad && !q.comunidad && !q.anio) {
    avisoTemporal('Rellena al menos un campo o usa «Ver alertas activas».');
    return;
  }
  ejecutarBusqueda(q);
});

$('#btnLimpiar').addEventListener('click', () => {
  $('#formBusqueda').reset();
  $('#fProvincia').innerHTML = '<option value="">Todas</option>';
  $('#fProvincia').disabled = true;
  $('#resumenFuentes').hidden = true;
  $('#detalleFuente').hidden = true;
  ultimaBusqueda = null; fuenteAbierta = null;
});

$('#btnAlertas').addEventListener('click', () => {
  paginaAlertas = { start: 0, max: 48 };
  ejecutarAlertas(false);
});

function avisoTemporal(txt) {
  const d = $('#detalleFuente');
  d.hidden = false;
  d.innerHTML = '<div class="tarjeta"><p>' + esc(txt) + '</p></div>';
}

function burbujaHTML(f, st) {
  let numero, estado;
  if (st.estado === 'cargando') { numero = '…'; estado = 'Consultando…'; }
  else if (st.estado === 'error') { numero = '—'; estado = st.error; }
  else if (st.datos && st.datos.nota) { numero = '0'; estado = st.datos.nota; }
  else { numero = String(st.datos ? st.datos.total : 0); estado = st.datos && st.datos.total === 0 ? 'Sin registros' : 'resultados'; }
  return `<button class="burbuja ${st.estado === 'cargando' ? 'cargando' : ''} ${fuenteAbierta === f.id ? 'seleccionada' : ''}" data-fuente="${f.id}">
    <h3>${f.nombre}${f.oficial ? '<span class="etiqueta-oficial">oficial</span>' : ''}</h3>
    <div class="numero">${numero}</div>
    <div class="estado ${st.estado === 'error' ? 'error' : ''}">${esc(estado)}</div>
  </button>`;
}

function pintarBurbujas() {
  const cont = $('#resumenFuentes');
  cont.hidden = false;
  cont.innerHTML = FUENTES.map(f => burbujaHTML(f, ultimaBusqueda.fuentes[f.id])).join('');
  cont.querySelectorAll('.burbuja').forEach(b => b.addEventListener('click', () => {
    fuenteAbierta = b.dataset.fuente;
    pintarBurbujas();
    pintarDetalle();
  }));
}

function pintarDetalle() {
  const cont = $('#detalleFuente');
  if (!fuenteAbierta || !ultimaBusqueda) { cont.hidden = true; return; }
  const st = ultimaBusqueda.fuentes[fuenteAbierta];
  cont.hidden = false;
  if (st.estado === 'cargando') { cont.innerHTML = '<div class="tarjeta"><p>Consultando…</p></div>'; return; }
  if (st.estado === 'error') { cont.innerHTML = '<div class="tarjeta"><p>' + esc(st.error) + '</p></div>'; return; }
  const datos = st.datos;
  if (!datos || datos.resultados.length === 0) {
    cont.innerHTML = '<div class="tarjeta"><p>' + esc(datos && datos.nota ? datos.nota : 'Sin registros en esta fuente para tu búsqueda.') + '</p></div>';
    return;
  }
  const esAlertas = ultimaBusqueda.modo === 'alertas';
  let html = datos.resultados.map(fichaHTML).join('');
  if (esAlertas && datos.hayMas) html += '<button class="boton-secundario cargar-mas" id="btnMas">Cargar más alertas</button>';
  if (datos.total > datos.resultados.length && !esAlertas) {
    html += '<p class="nota-form">Se muestran ' + datos.resultados.length + ' de ' + datos.total + ' registros. Afina los campos para acotar.</p>';
  }
  cont.innerHTML = html;
  cont.querySelectorAll('.boton-pista').forEach(b => b.addEventListener('click', () => prepararPista(fuenteAbierta, b.dataset.idx, b)));
  const btnMas = $('#btnMas');
  if (btnMas) btnMas.addEventListener('click', () => ejecutarAlertas(true));
}

function fichaHTML(f, i) {
  const badge = f.localizado
    ? '<span class="insignia localizado">Localizado/a</span>'
    : (f.oficial ? '<span class="insignia activa">Alerta activa</span>' : '');
  const foto = f.foto ? `<img src="${f.foto}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<div class="tarjeta ficha">
    ${foto}
    <div class="cuerpo-ficha">
      <h3>${badge}${esc(f.titulo)}</h3>
      <div class="meta">${[f.genero, f.tipo, f.fecha ? fechaCorta(f.fecha) || esc(f.fecha) : ''].filter(Boolean).map(esc).join(' · ')}</div>
      ${f.resumen ? `<p class="resumen">${esc(f.resumen)}</p>` : ''}
      ${f.necesidades ? `<p class="meta">⚠ ${esc(f.necesidades)}</p>` : ''}
      ${f.contacto ? `<p class="meta">Si tienes información: ${esc(f.contacto)}</p>` : ''}
      <div class="fila-acciones">
        <a class="enlace-fuente" href="${esc(f.url)}" target="_blank" rel="noopener">Ver en la fuente</a>
        <button class="boton-pista" data-idx="${i}">+ Guardar como pista</button>
      </div>
    </div>
  </div>`;
}

async function ejecutarBusqueda(q) {
  ultimaBusqueda = { modo: 'buscar', q, fuentes: {} };
  fuenteAbierta = null;
  FUENTES.forEach(f => ultimaBusqueda.fuentes[f.id] = { estado: 'cargando' });
  pintarBurbujas();
  $('#detalleFuente').hidden = true;

  const tareas = {
    CNDES: () => buscarCNDES(q),
    INTERPOL: () => buscarInterpol(q),
    PRENSA: () => buscarPrensa(q),
    WIKIDATA: () => buscarWikidata(q)
  };
  await Promise.all(Object.entries(tareas).map(async ([id, fn]) => {
    try {
      ultimaBusqueda.fuentes[id] = { estado: 'ok', datos: await fn() };
    } catch (err) {
      ultimaBusqueda.fuentes[id] = { estado: 'error', error: err.message };
    }
    pintarBurbujas();
    if (fuenteAbierta === id) pintarDetalle();
  }));
  // abrir automáticamente la primera fuente con resultados
  if (!fuenteAbierta) {
    const con = FUENTES.find(f => {
      const st = ultimaBusqueda.fuentes[f.id];
      return st.estado === 'ok' && st.datos.resultados.length > 0;
    });
    fuenteAbierta = con ? con.id : 'CNDES';
    pintarBurbujas();
    pintarDetalle();
  }
}

async function ejecutarAlertas(cargarMas) {
  if (!cargarMas) {
    ultimaBusqueda = { modo: 'alertas', fuentes: {} };
    FUENTES.forEach(f => ultimaBusqueda.fuentes[f.id] = { estado: 'cargando' });
    ['INTERPOL', 'PRENSA', 'WIKIDATA'].forEach(id =>
      ultimaBusqueda.fuentes[id] = { estado: 'ok', datos: { resultados: [], total: 0, nota: id === 'INTERPOL' ? 'Las alertas activas españolas las publica el CNDES.' : 'Usa el formulario para buscar en esta fuente.' } });
    fuenteAbierta = 'CNDES';
    paginaAlertas.start = 0;
  }
  pintarBurbujas();
  try {
    const [a, m] = await Promise.all([
      alertasCNDES('ADULTO', paginaAlertas.start, paginaAlertas.max),
      alertasCNDES('MENOR', paginaAlertas.start, paginaAlertas.max)
    ]);
    let prev = (cargarMas && ultimaBusqueda.fuentes.CNDES.datos) ? ultimaBusqueda.fuentes.CNDES.datos.resultados : [];
    const nuevos = [...prev, ...a.resultados, ...m.resultados];
    ultimaBusqueda.fuentes.CNDES = { estado: 'ok', datos: {
      resultados: nuevos,
      total: (a.total || 0) + (m.total || 0),
      hayMas: a.hayMas || m.hayMas
    } };
    paginaAlertas.start += paginaAlertas.max;
  } catch (err) {
    ultimaBusqueda.fuentes.CNDES = { estado: 'error', error: err.message };
  }
  pintarBurbujas();
  pintarDetalle();
}

/* ================= pistas ================= */
function prepararPista(fuenteId, idx, boton) {
  const st = ultimaBusqueda.fuentes[fuenteId];
  if (!st || !st.datos) return;
  const item = st.datos.resultados[Number(idx)];
  const casos = leerCasos();
  if (casos.length === 0) {
    // crear caso al vuelo con el nombre de la ficha
    const caso = { id: 'c' + Date.now(), titulo: item.titulo, notas: '', creado: ahoraISO(), pistas: [] };
    casos.push(caso);
    guardarCasos(casos);
    anadirPistaACaso(caso.id, item);
    boton.textContent = 'Pista guardada en nuevo caso';
    boton.disabled = true;
    actualizarContador();
    return;
  }
  if (casos.length === 1) {
    anadirPistaACaso(casos[0].id, item);
    boton.textContent = 'Pista guardada';
    boton.disabled = true;
    return;
  }
  // varios casos: elegir
  const opciones = casos.map((c, i) => (i + 1) + '. ' + c.titulo).join('\n');
  const resp = prompt('¿En qué caso guardo la pista?\n' + opciones, '1');
  const n = parseInt(resp, 10);
  if (n >= 1 && n <= casos.length) {
    anadirPistaACaso(casos[n - 1].id, item);
    boton.textContent = 'Pista guardada';
    boton.disabled = true;
  }
}

function anadirPistaACaso(casoId, item) {
  const casos = leerCasos();
  const c = casos.find(x => x.id === casoId);
  if (!c) return;
  if (c.pistas.some(p => p.url === item.url)) return; // ya estaba
  c.pistas.push({
    id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
    fuente: item.fuente,
    oficial: !!item.oficial,
    titulo: item.titulo,
    detalle: item.resumen || item.fecha || '',
    url: item.url,
    fecha: item.fecha || '',
    agregada: ahoraISO(),
    estado: 'sin-verificar'
  });
  guardarCasos(casos);
  actualizarContador();
}

/* ================= casos ================= */
$('#formCaso').addEventListener('submit', e => {
  e.preventDefault();
  const casos = leerCasos();
  casos.push({
    id: 'c' + Date.now(),
    titulo: $('#cTitulo').value.trim(),
    notas: $('#cNotas').value.trim(),
    creado: ahoraISO(),
    pistas: []
  });
  guardarCasos(casos);
  $('#cTitulo').value = ''; $('#cNotas').value = '';
  pintarCasos();
  actualizarContador();
});

function pintarCasos() {
  const casos = leerCasos();
  const cont = $('#listaCasos');
  if (casos.length === 0) {
    cont.innerHTML = '<p class="nota-form">Todavía no hay casos. Puedes crear uno abajo o guardar una pista desde una búsqueda.</p>';
    $('#detalleCaso').hidden = true;
    return;
  }
  cont.innerHTML = casos.map(c => `
    <button class="caso-linea" data-id="${c.id}">
      <span><span class="tit">${esc(c.titulo)}</span><br>
      <span class="sub">${c.pistas.length} pista(s) · creado ${fechaCorta(c.creado)}</span></span>
      <span aria-hidden="true">›</span>
    </button>`).join('');
  cont.querySelectorAll('.caso-linea').forEach(b => b.addEventListener('click', () => pintarDetalleCaso(b.dataset.id)));
}

function grupoCorroboracion(caso) {
  // nombres normalizados repetidos en fuentes distintas
  const porNombre = {};
  caso.pistas.forEach(p => {
    const n = normaliza(p.titulo);
    if (!n) return;
    porNombre[n] = porNombre[n] || new Set();
    porNombre[n].add(p.fuente);
  });
  return Object.entries(porNombre).filter(([, s]) => s.size > 1).map(([n, s]) => ({ nombre: n, fuentes: [...s] }));
}

function pintarDetalleCaso(id) {
  const c = casoPorId(id);
  const cont = $('#detalleCaso');
  if (!c) { cont.hidden = true; return; }
  cont.hidden = false;
  const coros = grupoCorroboracion(c);
  const orden = { 'sin-verificar': 0, 'corroborada': 1, 'descartada': 2 };
  const pistas = [...c.pistas].sort((a, b) => orden[a.estado] - orden[b.estado]);
  cont.innerHTML = `
    <div class="tarjeta">
      <h2>${esc(c.titulo)}</h2>
      ${c.notas ? `<p>${esc(c.notas)}</p>` : ''}
      <p class="meta">Creado ${fechaCorta(c.creado)} · los datos no salen de este navegador.</p>
      ${coros.map(g => `<div class="aviso-coro">Coincidencia de nombre: «${esc(g.nombre)}» aparece en ${g.fuentes.length} fuentes distintas (${g.fuentes.join(', ')}). Esto no prueba que sea la misma persona; compruébalo en las fuentes originales antes de marcarla como corroborada.</div>`).join('')}
      <div class="fila-acciones">
        <button class="boton-secundario" id="btnPistaManual">+ Pista manual</button>
        <button class="boton-secundario" id="btnInforme">Generar informe para autoridades</button>
        <button class="boton-secundario" id="btnExportar">Exportar JSON</button>
        <button class="boton-discreto" id="btnBorrarCaso">Borrar caso</button>
      </div>
    </div>
    <div id="pistas">${pistas.map(p => pistaHTML(c, p)).join('') || '<p class="nota-form">Sin pistas todavía. Busca y guarda resultados con «+ Guardar como pista».</p>'}</div>
  `;
  cont.querySelectorAll('select.estado-pista').forEach(s => s.addEventListener('change', () => {
    const casos = leerCasos();
    const cc = casos.find(x => x.id === id);
    const p = cc.pistas.find(x => x.id === s.dataset.pid);
    p.estado = s.value;
    guardarCasos(casos);
    pintarDetalleCaso(id);
  }));
  cont.querySelectorAll('.borrar-pista').forEach(b => b.addEventListener('click', () => {
    const casos = leerCasos();
    const cc = casos.find(x => x.id === id);
    cc.pistas = cc.pistas.filter(x => x.id !== b.dataset.pid);
    guardarCasos(casos);
    pintarDetalleCaso(id);
    pintarCasos();
  }));
  $('#btnPistaManual').addEventListener('click', () => {
    const titulo = prompt('Describe la pista (qué, quién la aporta, cuándo):');
    if (!titulo) return;
    const casos = leerCasos();
    const cc = casos.find(x => x.id === id);
    cc.pistas.push({
      id: 'p' + Date.now(), fuente: 'MANUAL', oficial: false,
      titulo, detalle: '', url: '', fecha: '', agregada: ahoraISO(), estado: 'sin-verificar'
    });
    guardarCasos(casos);
    pintarDetalleCaso(id);
    pintarCasos();
  });
  $('#btnExportar').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'llanterna-' + normaliza(c.titulo).replace(/ /g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#btnInforme').addEventListener('click', () => generarInforme(c));
  $('#btnBorrarCaso').addEventListener('click', () => {
    if (!confirm('¿Borrar este caso y todas sus pistas?')) return;
    guardarCasos(leerCasos().filter(x => x.id !== id));
    cont.hidden = true;
    pintarCasos();
    actualizarContador();
  });
  cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pistaHTML(c, p) {
  const estados = [['sin-verificar', 'Sin verificar'], ['corroborada', 'Corroborada'], ['descartada', 'Descartada']];
  return `<div class="pista ${p.estado === 'descartada' ? 'descartada' : ''}">
    <div class="cab-pista">
      <span class="chip-fuente ${p.oficial ? 'oficial' : ''}">${esc(p.fuente)}</span>
      <span class="tit-pista">${esc(p.titulo)}</span>
      <select class="estado-pista" data-pid="${p.id}">
        ${estados.map(([v, t]) => `<option value="${v}" ${p.estado === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <button class="boton-discreto borrar-pista" data-pid="${p.id}" title="Quitar pista">✕</button>
    </div>
    ${p.detalle ? `<p class="detalle">${esc(p.detalle)}</p>` : ''}
    <div class="meta">${[p.fecha ? fechaCorta(p.fecha) || esc(p.fecha) : '', 'guardada ' + fechaCorta(p.agregada)].filter(Boolean).join(' · ')}
      ${p.url ? ` · <a class="enlace-fuente" href="${esc(p.url)}" target="_blank" rel="noopener">fuente</a>` : ''}</div>
  </div>`;
}

/* ================= informe ================= */
function generarInforme(c) {
  const coros = grupoCorroboracion(c);
  const grupo = est => c.pistas.filter(p => p.estado === est);
  const seccion = (titulo, lista) => lista.length ? `
    <h2>${titulo} (${lista.length})</h2>
    ${lista.map(p => `<div class="pista-imp">
      <strong>${esc(p.titulo)}</strong> [${esc(p.fuente)}]<br>
      ${p.detalle ? esc(p.detalle) + '<br>' : ''}
      ${p.fecha ? 'Fecha: ' + esc(p.fecha) + ' · ' : ''}Registrada: ${fechaCorta(p.agregada)}
      ${p.url ? '<br>Fuente: ' + esc(p.url) : ''}
    </div>`).join('')}` : '';
  $('#informeImpresion').innerHTML = `
    <h1>Informe de caso — Llanterna</h1>
    <p><strong>Caso:</strong> ${esc(c.titulo)}<br>
    <strong>Generado:</strong> ${new Date().toLocaleString('es-ES')}<br>
    ${c.notas ? '<strong>Notas:</strong> ' + esc(c.notas) + '<br>' : ''}
    <strong>Resumen:</strong> ${c.pistas.length} pista(s): ${grupo('corroborada').length} corroborada(s), ${grupo('sin-verificar').length} sin verificar, ${grupo('descartada').length} descartada(s).</p>
    ${coros.length ? '<p><strong>Posibles corroboraciones entre fuentes:</strong> ' + coros.map(g => '«' + esc(g.nombre) + '» (' + g.fuentes.join(', ') + ')').join('; ') + '.</p>' : ''}
    ${seccion('Pistas corroboradas', grupo('corroborada'))}
    ${seccion('Pistas sin verificar', grupo('sin-verificar'))}
    ${seccion('Pistas descartadas', grupo('descartada'))}
    <h2>Teléfonos oficiales</h2>
    <p>Policía Nacional 091 · Guardia Civil 062 · Emergencias 112 · Menores 116 000 · CNDES: colaboracion-cndes@interior.es</p>
    <p><small>Generado con Llanterna. Cada pista enlaza a su fuente original; el estado de verificación lo asignó la persona usuaria.</small></p>
  `;
  window.print();
}

/* ================= borrar todo ================= */
$('#btnBorrarDatos').addEventListener('click', () => {
  if (!confirm('¿Borrar todos los casos y pistas guardados en este navegador?')) return;
  localStorage.removeItem(CLAVE);
  pintarCasos();
  actualizarContador();
});

actualizarContador();
