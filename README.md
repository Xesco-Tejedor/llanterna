# Llanterna

Herramienta web gratuita de apoyo a la búsqueda de personas desaparecidas: consulta en vivo fuentes oficiales y públicas y organiza pistas verificables para entregar a las autoridades.

**Demo:** https://xesco-tejedor.github.io/llanterna/

## Qué hace

- **CNDES (oficial, España):** búsqueda por nombre, apellidos, sexo, edad, comunidad, provincia y año de desaparición; alertas activas de adultos y menores; insignia «localizado/a» cuando la fuente lo indica; enlace a cada ficha oficial. Los nombres se muestran con iniciales, tal como los publica el Ministerio del Interior.
- **Interpol (oficial, internacional):** notificaciones amarillas por nombre y apellido, con foto y enlace a la notificación oficial.
- **Prensa (GDELT):** artículos recientes en español relacionados con el nombre o la zona; marcados como contexto no oficial.
- **Wikidata:** casos documentados con fecha de desaparición cuando se busca por nombre.
- **Casos y pistas:** guarda resultados como pistas, marca su estado (sin verificar / corroborada / descartada), detecta posibles corroboraciones entre fuentes y genera un **informe imprimible** con teléfonos oficiales (091, 062, 112, 116 000).

## Qué no hace

No localiza teléfonos ni accede a datos privados; no verifica por sí sola; no garantiza resultados. Si una fuente falla, lo indica en lugar de simular datos. Los casos y pistas se guardan únicamente en el navegador (localStorage), sin servidores.

## Fuentes

- CNDES — Ministerio del Interior (España): https://cndes-web.ses.mir.es/publico/Desaparecidos/
- Interpol — notificaciones amarillas: https://www.interpol.int/How-we-work/Notices/Yellow-Notices/View-Yellow-Notices
- GDELT Project (prensa, límite de una consulta cada pocos segundos): https://www.gdeltproject.org/
- Wikidata: https://www.wikidata.org/

Los datos de CNDES e Interpol pertenecen a sus organismos y se muestran con el mismo fin con que se publican: la colaboración ciudadana. Si reconoces a alguien, llama al teléfono que indica su ficha oficial.

## Uso local

Es una web estática: abre `index.html` con cualquier servidor (por ejemplo `python3 -m http.server`) o despliégala tal cual en GitHub Pages. Sin claves, sin backend, sin dependencias.
