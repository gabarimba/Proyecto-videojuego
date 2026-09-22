"use strict";

// Pega Project URL y una clave pública anon (legacy) o publishable de Supabase.
// Project Settings > API / API Keys. Nunca pegues service_role ni secret keys.
// Vacías = juego completamente funcional con ranking local.
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

/* Ejecuta esto una vez en SQL Editor de un proyecto nuevo de Supabase:

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  score integer not null check (score between 0 and 1000000),
  created_at timestamptz not null default now()
);
alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;
grant select on public.scores to anon;
grant insert (name, score) on public.scores to anon;
create policy "Lectura del ranking" on public.scores
  for select to anon using (true);
create policy "Registrar resultado" on public.scores
  for insert to anon with check (
    char_length(trim(name)) between 1 and 80 and score between 0 and 1000000
  );
create index scores_top_idx on public.scores (score desc, created_at asc);

La API del navegador solo puede leer e insertar: no editar ni borrar.
Este ranking escolar confía en el cliente; no es un sistema antitrampas.
No necesitas instalar el SDK: usamos fetch contra la API REST oficial.
*/

const CLAVE_RANKING = "call-of-malware.scores.v1";
let rankingMemoria = [];
let almacenamientoDisponible = true;

function filasValidas(filas) {
  if (!Array.isArray(filas)) return [];
  return filas.filter(f => f && typeof f.name === "string" && Number.isInteger(f.score)
    && f.score >= 0 && f.score <= 1000000).map(f => ({
      name: f.name.slice(0, 80), score: f.score,
      created_at: typeof f.created_at === "string" ? f.created_at : ""
    })).sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at)).slice(0, 50);
}

function leerRankingLocal() {
  try {
    const guardado = localStorage.getItem(CLAVE_RANKING);
    rankingMemoria = guardado ? filasValidas(JSON.parse(guardado)) : rankingMemoria;
  } catch (_) {
    // El modo privado o un JSON dañado nunca deben detener la partida.
    almacenamientoDisponible = false;
  }
  return rankingMemoria;
}

function guardarLocal(fila) {
  rankingMemoria = filasValidas([...leerRankingLocal(), fila]);
  try {
    localStorage.setItem(CLAVE_RANKING, JSON.stringify(rankingMemoria));
    almacenamientoDisponible = true;
  } catch (_) { almacenamientoDisponible = false; }
}

function supabaseConfigurado() {
  return /^https:\/\//.test(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY.trim());
}

async function pedirSupabase(ruta, opciones = {}) {
  if (!supabaseConfigurado()) throw new Error("Supabase sin configurar");
  const controlador = new AbortController();
  // Si el servicio tarda o no hay internet, volvemos al ranking local en 4 s.
  const limite = setTimeout(() => controlador.abort(), 4000);
  try {
    const headers = { apikey: SUPABASE_ANON_KEY, ...opciones.headers };
    // Las claves publishable nuevas no son JWT y no van en Authorization.
    if (!SUPABASE_ANON_KEY.startsWith("sb_publishable_")) {
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }
    const respuesta = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/scores${ruta}`, {
      ...opciones, headers, signal: controlador.signal, cache: "no-store"
    });
    if (!respuesta.ok) throw new Error(`Ranking HTTP ${respuesta.status}`);
    return respuesta;
  } finally { clearTimeout(limite); }
}

async function guardarPuntaje(nombre, puntos) {
  const fila = { name: String(nombre).trim().slice(0, 80) || "Antivirus",
    score: Math.max(0, Math.min(1000000, Math.floor(Number(puntos) || 0))),
    created_at: new Date().toISOString() };
  // Siempre conservamos una copia local, aunque el envío en línea funcione.
  guardarLocal(fila);
  try {
    await pedirSupabase("", { method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name: fila.name, score: fila.score }) });
    return { origen: "en línea" };
  } catch (_) { return { origen: "local", persistente: almacenamientoDisponible }; }
}

async function obtenerTop5() {
  try {
    const respuesta = await pedirSupabase("?select=name,score,created_at&order=score.desc,created_at.asc&limit=5");
    const datos = await respuesta.json();
    if (!Array.isArray(datos) || datos.some(f => !f || typeof f.name !== "string" || !Number.isInteger(f.score) || f.score < 0 || f.score > 1000000)) {
      throw new Error("Formato del ranking no válido");
    }
    return { puntajes: filasValidas(datos).slice(0, 5), origen: "en línea", persistente: true };
  } catch (_) {
    const puntajes = leerRankingLocal().slice(0, 5);
    return { puntajes, origen: "local", persistente: almacenamientoDisponible };
  }
}
