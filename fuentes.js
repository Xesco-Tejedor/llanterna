/* Llanterna — adaptadores de fuentes. Cada adaptador devuelve:
   { resultados: [...], total: number|null, hayMas: bool, error: null }
   o lanza un Error con mensaje claro y honesto. */

const CNDES_SERVLET = 'https://cndes-web.ses.mir.es/publico/Desaparecidos/dao/ServletDesaparecidos';
const CNDES_FICHA = 'https://cndes-web.ses.mir.es/publico/Desaparecidos/Detalle-Desaparecido.html?desaparecido=';

const COMUNIDADES = [
  ['1','ANDALUCÍA'], ['11','ARAGÓN'], ['13','ASTURIAS'], ['14','BALEARES'],
  ['8','CANARIAS'], ['16','CANTABRIA'], ['9','CASTILLA LA MANCHA'],
  ['6','CASTILLA Y LEÓN'], ['2','CATALUÑA'], ['18','CEUTA'],
  ['3','COMUNIDAD DE MADRID'], ['4','COMUNIDAD VALENCIANA'], ['12','EXTREMADURA'],
  ['5','GALICIA'], ['17','LA RIOJA'], ['19','MELILLA'], ['10','MURCIA'],
  ['15','NAVARRA'], ['7','PAÍS VASCO']
];

async function postCNDES(params) {
  const fd = new URLSearchParams(params);
  const r = await fetch(CNDES_SERVLET, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('CNDES ha respondido con un error (HTTP ' + r.status + '). Inténtalo de nuevo en unos segundos.');
  return r.json();
}

function mapaFichaCNDES(p) {
  const localizado = String(p.localizado) === '1';
  return {
    fuente: 'CNDES',
    oficial: true,
    id: p.id,
    titulo: p.nombreCompleto || 'Sin nombre publicado',
    genero: p.genero || '',
    tipo: p.tipoDesaparecido || '',
    fecha: p.fechaDesaparicion || '',
    resumen: (p.resumenWeb && p.resumenWeb !== 'None') ? p.resumenWeb : '',
    necesidades: (p.necesidades && p.necesidades !== 'None') ? p.necesidades : '',
    contacto: (p.cuerpo ? p.cuerpo : '') + (p.telefono ? ' · ' + p.telefono : ''),
    localizado,
    foto: p.foto ? 'data:image/jpeg;base64,' + p.foto : null,
    url: CNDES_FICHA + encodeURIComponent(p.id)
  };
}

/* Búsqueda por campos en CNDES */
async function buscarCNDES(q) {
  const params = {
    operacion: 'buscar', start: '0', max: '60', filtro: '', orden: '',
    nombreDesaparecido: q.nombre || '',
    apellido1Desaparecido: q.ap1 || '',
    apellido2Desaparecido: q.ap2 || '',
    sexoDesaparecido: q.sexo || '',
    comunidadDesaparicion: q.comunidad || '',
    provinciaDesaparicion: q.provincia || '',
    edadDesaparicion: q.edad || '',
    anioDesaparecido: q.anio || ''
  };
  const d = await postCNDES(params);
  if (d.aviso) return { resultados: [], total: 0, hayMas: false };
  let lista = (d.desaparecidos || []).map(mapaFichaCNDES);
  if (q.tipo === 'MENOR') lista = lista.filter(x => x.tipo === 'MENOR');
  if (q.tipo === 'ADULTO') lista = lista.filter(x => x.tipo !== 'MENOR');
  return { resultados: lista, total: d.totalRegistros ?? lista.length, hayMas: false };
}

/* Alertas activas (verTodos) con paginación */
async function alertasCNDES(tipo, start, max) {
  const d = await postCNDES({
    operacion: 'verTodos', start: String(start), max: String(max),
    locale: 'es', filtro: '', orden: '', tipoDesaparecido: tipo
  });
  if (d.aviso) return { resultados: [], total: 0, hayMas: false };
  const lista = (d.desaparecidos || []).map(mapaFichaCNDES);
  const total = d.totalRegistros ?? lista.length;
  return { resultados: lista, total, hayMas: (start + max) < total };
}

async function cargarProvincias(codComunidad) {
  const d = await postCNDES({ operacion: 'cargarProvincias', codComunidad });
  const arr = d.provincia || d[Object.keys(d)[0]] || [];
  return arr.map(p => ({ codigo: p.codigoProvincia, nombre: p.nombreProvincia }));
}

/* ---------------- Interpol: notificaciones amarillas ---------------- */

const INTERPOL_API = 'https://ws-public.interpol.int/notices/v1/yellow';

async function buscarInterpol(q) {
  if (!q.nombre && !q.ap1) {
    return { resultados: [], total: 0, hayMas: false, nota: 'Interpol necesita al menos un nombre o apellido.' };
  }
  const u = new URL(INTERPOL_API);
  if (q.nombre) u.searchParams.set('forename', q.nombre);
  if (q.ap1) u.searchParams.set('name', q.ap1);
  u.searchParams.set('resultPerPage', '40');
  let r;
  try {
    r = await fetch(u);
  } catch (e) {
    throw new Error('No se ha podido consultar Interpol desde este navegador. Puedes buscar manualmente en su página oficial.');
  }
  if (!r.ok) throw new Error('Interpol ha respondido con un error (HTTP ' + r.status + '). Puedes buscar manualmente en su página oficial.');
  const d = await r.json();
  const lista = (d._embedded && d._embedded.notices ? d._embedded.notices : []).map(n => {
    const ficha = n._links && n._links.self ? n._links.self.href : null;
    const thumb = n._links && n._links.thumbnail ? n._links.thumbnail.href : null;
    const eid = (n.entity_id || '').replace('/', '-');
    return {
      fuente: 'INTERPOL',
      oficial: true,
      id: eid,
      titulo: ((n.forename || '') + ' ' + (n.name || '')).trim(),
      fecha: n.date_of_birth ? 'Nacimiento: ' + n.date_of_birth : '',
      resumen: 'Nacionalidad: ' + (n.nationalities || []).join(', '),
      foto: thumb,
      localizado: false,
      url: 'https://www.interpol.int/How-we-work/Notices/View-Yellow-Notices#' + eid,
      urlApi: ficha
    };
  });
  return { resultados: lista, total: d.total ?? lista.length, hayMas: false };
}

/* ---------------- GDELT: prensa ---------------- */

async function buscarPrensa(q) {
  let consulta;
  const nombreCompleto = [q.nombre, q.ap1, q.ap2].filter(Boolean).join(' ');
  if (nombreCompleto) {
    consulta = '"' + nombreCompleto + '" (desaparecido OR desaparecida) sourcelang:spanish';
  } else {
    let donde = '';
    if (q.provinciaNombre) donde = ' "' + q.provinciaNombre + '"';
    else if (q.comunidadNombre) donde = ' "' + q.comunidadNombre + '"';
    consulta = '("persona desaparecida" OR "desaparecido" OR "desaparecida")' + donde + ' sourcelang:spanish';
  }
  const u = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  u.searchParams.set('query', consulta);
  u.searchParams.set('mode', 'artlist');
  u.searchParams.set('maxrecords', '15');
  u.searchParams.set('format', 'json');
  u.searchParams.set('sort', 'hybridrel');
  // GDELT limita a una petición cada 5 segundos por IP: un reintento espaciado
  async function intento() {
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  let d;
  try {
    d = await intento();
  } catch (e1) {
    await new Promise(res => setTimeout(res, 6500));
    try {
      d = await intento();
    } catch (e2) {
      throw new Error('El servicio de prensa (GDELT) está limitando las peticiones (máx. 1 cada 5 segundos). Inténtalo de nuevo en unos segundos.');
    }
  }
  const lista = (d.articles || []).map(a => ({
    fuente: 'PRENSA',
    oficial: false,
    id: a.url,
    titulo: a.title || 'Sin título',
    fecha: (function(sd) {
      if (!sd) return '';
      const m = String(sd).match(/^(\d{4})(\d{2})(\d{2})/);
      return m ? m[3] + '/' + m[2] + '/' + m[1] : String(sd);
    })(a.seendate),
    resumen: (a.domain || '') + (a.sourcecountry ? ' · ' + a.sourcecountry : ''),
    foto: a.socialimage || null,
    localizado: false,
    url: a.url
  }));
  return { resultados: lista, total: lista.length, hayMas: false };
}

/* ---------------- Wikidata: casos documentados ---------------- */

async function buscarWikidata(q) {
  const termino = [q.nombre, q.ap1].filter(Boolean).join(' ');
  if (!termino) return { resultados: [], total: 0, hayMas: false, nota: 'Wikidata necesita al menos un nombre o apellido.' };
  const sparql = `
    SELECT ?item ?itemLabel ?itemDescription ?fecha WHERE {
      ?item wdt:P31 wd:Q5 ; wdt:P746 ?fecha ; rdfs:label ?etiqueta .
      FILTER(LANG(?etiqueta) = "es" || LANG(?etiqueta) = "en")
      FILTER(CONTAINS(LCASE(STR(?etiqueta)), ${JSON.stringify(termino.toLowerCase())}))
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    } ORDER BY DESC(?fecha) LIMIT 10`;
  const u = new URL('https://query.wikidata.org/sparql');
  u.searchParams.set('query', sparql);
  u.searchParams.set('format', 'json');
  const r = await fetch(u, { headers: { 'Accept': 'application/sparql-results+json' } });
  if (!r.ok) throw new Error('Wikidata no ha respondido (HTTP ' + r.status + '). Es una fuente secundaria; el resto de la búsqueda sigue disponible.');
  const d = await r.json();
  const lista = (d.results && d.results.bindings ? d.results.bindings : []).map(b => {
    const id = (b.item.value || '').split('/').pop();
    return {
      fuente: 'WIKIDATA',
      oficial: false,
      id,
      titulo: b.itemLabel ? b.itemLabel.value : id,
      fecha: b.fecha ? 'Desaparición: ' + String(b.fecha.value).slice(0, 10) : '',
      resumen: b.itemDescription ? b.itemDescription.value : '',
      foto: null,
      localizado: false,
      url: b.item.value
    };
  });
  return { resultados: lista, total: lista.length, hayMas: false };
}
