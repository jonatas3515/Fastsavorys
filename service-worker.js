/**
 * FastSavory's Service Worker
 * 
 * STRATEGY: NETWORK FIRST para TODOS os recursos
 * Garante que o cliente SEMPRE recebe a versão mais recente
 * Cache é usado APENAS como fallback quando offline
 */
const CACHE_NAME = 'fastsavorys-v34';
const CACHE_VERSION = 'v34';

// URLs para cache offline - apenas essenciais
const urlsToCache = [
  '/',
  '/index.html',
  '/pages/fast.html',
  '/assets/img/fast-logo.png',
  '/assets/img/icon-192.svg',
  '/assets/img/icon-512.svg'
];

// Instalar Service Worker
self.addEventListener('install', function (event) {
  console.log('[SW ' + CACHE_VERSION + '] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(
          urlsToCache.map(function (url) {
            return cache.add(url).catch(function (err) {
              console.warn('[SW ' + CACHE_VERSION + '] Falha ao cachear:', url);
              return Promise.resolve();
            });
          })
        );
      })
  );
  // Força ativação imediata - não espera abas fecharem
  self.skipWaiting();
});

// Ativar e limpar TODOS os caches antigos
self.addEventListener('activate', function (event) {
  console.log('[SW ' + CACHE_VERSION + '] Ativando...');
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW ' + CACHE_VERSION + '] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    }).then(function () {
      // Toma controle imediato de TODAS as abas abertas
      return self.clients.claim();
    })
  );
});

// NETWORK FIRST para TUDO - sempre busca do servidor primeiro
self.addEventListener('fetch', function (event) {
  // Ignorar requisições não-GET
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);

  // Ignorar requisições não-HTTP
  if (!url.protocol.startsWith('http')) return;

  // Ignorar Supabase e APIs externas
  if (url.hostname.includes('supabase') || url.hostname.includes('api.') || url.hostname.includes('stripe')) return;

  // NETWORK FIRST para TODOS os recursos
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        // Resposta OK - atualiza cache e retorna
        if (response && response.status === 200) {
          var responseToCache = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(function () {
        // Offline - tenta cache
        return caches.match(event.request).then(function (cached) {
          if (cached) return cached;
          // Fallback final
          return caches.match('/index.html');
        });
      })
  );
});
