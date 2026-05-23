// data-lite.js — PR #25 (Data-Lite #2)
//
// Helper para contadores agregados via endpoints summary do backend (PR #24).
//
// Regra de ouro: contadores globais NUNCA podem depender de S.leads.length.
// Quando a flag `localStorage.useDataLite === '1'` está ON, consumidores chamam
// DL.counter(...) que retorna o valor do summary. Se a flag estiver OFF, ou se
// houver qualquer erro no fetch/cache, cai automaticamente em legacyFn() — que
// é o cálculo legado sobre S.leads. Zero quebra de comportamento atual.
//
// API:
//   DL.enabled()                          → bool (flag ligada?)
//   DL.fetchSummary(kind)                 → Promise<obj|null>  (faz refetch)
//   DL.getSummary(kind)                   → obj|null          (síncrono, último valor)
//   DL.counter(kind, accessor, legacyFn)  → number            (com fallback)
//   DL.invalidate(kind?)                  → void              (limpa cache)
//   DL.prefetchAll()                      → Promise<void>     (carrega os 3 summaries)
//
// kind ∈ { 'leads', 'inbox', 'kanban' }.
// accessor: (obj) => number — pega o número desejado dentro do summary.
// legacyFn: () => number    — fallback quando summary indisponível.
//
// Cache: TTL 10s + stale-while-revalidate + in-flight dedup. Erros silenciam
// no console (debug) e retornam null pro chamador.

;(function(){
  var TTL_MS = 10000

  var ENDPOINTS = {
    leads:  '/api/v1/leads/summary',
    inbox:  '/api/v1/leads/inbox/summary',
    kanban: '/api/v1/kanban/summary',
  }

  // cache[kind] = { value, fetchedAt }
  var cache = Object.create(null)
  // inflight[kind] = Promise
  var inflight = Object.create(null)

  function enabled() {
    try { return localStorage.getItem('useDataLite') === '1' } catch (e) { return false }
  }

  function getSummary(kind) {
    var entry = cache[kind]
    return entry ? entry.value : null
  }

  function invalidate(kind) {
    if (kind) { delete cache[kind]; delete inflight[kind] }
    else      { cache = Object.create(null); inflight = Object.create(null) }
  }

  function _doFetch(kind) {
    var url = ENDPOINTS[kind]
    if (!url) return Promise.resolve(null)
    var token = (typeof getToken === 'function') ? getToken() : null
    if (!token) return Promise.resolve(null)
    return fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r){ return r.ok ? r.json() : null })
      .then(function(data){
        if (data && typeof data === 'object') {
          var wasEmpty = !cache[kind]
          cache[kind] = { value: data, fetchedAt: Date.now() }
          // Trigger re-render quando o cache passou de vazio→cheio. Sem isso,
          // counter() na primeira render retorna legacyFn (0 em modo lite com
          // S.leads vazio) e a UI nunca atualiza. Stale-while-revalidate de
          // refresh subsequentes não precisa re-render (valor já estava certo).
          if (wasEmpty && typeof scheduleRender === 'function') {
            try { scheduleRender() } catch (e) {}
          }
          return data
        }
        return null
      })
      .catch(function(err){
        try { console.debug('[DL] fetch ' + kind + ' falhou:', err && err.message) } catch (e) {}
        return null
      })
      .finally(function(){ delete inflight[kind] })
  }

  function fetchSummary(kind) {
    if (inflight[kind]) return inflight[kind]
    inflight[kind] = _doFetch(kind)
    return inflight[kind]
  }

  // Lê com stale-while-revalidate. Se vencido, dispara refetch em background e
  // retorna o valor antigo (ou null se nunca houve). Não bloqueia o render.
  function _readSWR(kind) {
    var entry = cache[kind]
    var now = Date.now()
    if (!entry) {
      // primeira leitura: dispara fetch sem aguardar
      if (!inflight[kind]) fetchSummary(kind)
      return null
    }
    if (now - entry.fetchedAt > TTL_MS && !inflight[kind]) {
      fetchSummary(kind) // refresh em background
    }
    return entry.value
  }

  // Principal: retorna valor do summary com fallback. Pensado pra ser usado em
  // qualquer view: se DL desligado, vai direto pro legacy. Se ON mas cache
  // ainda vazio, idem (e dispara fetch pra próxima passada de render).
  function counter(kind, accessor, legacyFn) {
    if (!enabled()) return legacyFn()
    try {
      var data = _readSWR(kind)
      if (!data) return legacyFn()
      var v = accessor(data)
      if (typeof v !== 'number' || !isFinite(v)) return legacyFn()
      return v
    } catch (err) {
      try { console.debug('[DL] counter ' + kind + ' fallback:', err && err.message) } catch (e) {}
      return legacyFn()
    }
  }

  function prefetchAll() {
    if (!enabled()) return Promise.resolve()
    return Promise.all([
      fetchSummary('leads'),
      fetchSummary('inbox'),
      fetchSummary('kanban'),
    ]).then(function(){})
  }

  window.DL = {
    enabled: enabled,
    fetchSummary: fetchSummary,
    getSummary: getSummary,
    counter: counter,
    invalidate: invalidate,
    prefetchAll: prefetchAll,
  }

  // Sinal claro no console pra confirmar a flag em produção.
  if (enabled()) {
    try {
      console.info(
        '%c⚡ Data-Lite ativo',
        'background:#4f46e5;color:#fff;padding:2px 8px;border-radius:4px;font-weight:600',
        '\nCounters via /summary, kanban via /leads/lite. Para desativar: localStorage.removeItem("useDataLite") + reload.'
      )
    } catch (e) {}
  }
})()
