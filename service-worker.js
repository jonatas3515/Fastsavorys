/**
 * FastSavory's Service Worker
 * 
 * CACHE VERSIONING CONVENTION:
 * - Increment CACHE_NAME version (e.g., v11 → v12) on every frontend release
 *   that includes changes to cached assets (HTML, CSS, JS, images)
 * - This forces clients to download fresh assets and clear old cache
 * - Format: 'fastsavorys-vNN' where NN is the version number
 */
const CACHE_NAME = 'fastsavorys-v11';
const CACHE_VERSION = 'v11';

// URLs para cache - paths relativos à raiz do site
const urlsToCache = [
  '/',
  '/index.html',
  '/pages/fast.html',
  '/assets/img/fast-logo.png',
  '/assets/img/icon-192.svg',
  '/assets/img/icon-512.svg',
  '/assets/css/styles.css'
];

// Instalar Service Worker e fazer cache dos arquivos
self.addEventListener('install', function (event) {
  console.log('[SW ' + CACHE_VERSION + '] Instalando FastSavorys ' + CACHE_VERSION + '...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        console.log('[SW ' + CACHE_VERSION + '] Cache aberto, adicionando arquivos...');
        // Adiciona arquivos um a um para evitar falha total se um não existir
        return Promise.all(
          urlsToCache.map(function (url) {
            return cache.add(url).catch(function (err) {
              console.warn('[SW ' + CACHE_VERSION + '] Falha ao cachear:', url, err.message);
              // Não falha a instalação se um arquivo não existir
              return Promise.resolve();
            });
          })
        );
      })
      .then(function () {
        console.log('[SW ' + CACHE_VERSION + '] Instalação concluída');
      })
      .catch(function (err) {
        console.error('[SW ' + CACHE_VERSION + '] Erro na instalação:', err);
      })
  );
  self.skipWaiting();
});

// Ativar Service Worker e limpar TODOS os caches antigos
self.addEventListener('activate', function (event) {
  console.log('[SW ' + CACHE_VERSION + '] Ativando e limpando caches antigos...');
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          // Remove QUALQUER cache que não seja o atual
          if (cacheName !== CACHE_NAME) {
            console.log('[SW ' + CACHE_VERSION + '] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    }).then(function () {
      console.log('[SW ' + CACHE_VERSION + '] Ativação concluída, assumindo controle...');
      return self.clients.claim();
    })
  );
});

// Interceptar requisições - NETWORK FIRST para HTML, CACHE FIRST para assets
self.addEventListener('fetch', function (event) {
  // Ignorar requisições POST, PUT, DELETE (não podem ser cacheadas)
  if (event.request.method !== 'GET') {
    return;
  }

  var url = new URL(event.request.url);

  // Ignorar requisições não-HTTP (extensões Chrome, data:, blob:, etc.)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Ignorar requisições para Supabase ou APIs externas
  if (url.hostname.includes('supabase') || url.hostname.includes('api.')) {
    return;
  }

  // Determinar se é HTML
  var isHTML = url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    (url.pathname.endsWith('/') && !url.pathname.includes('.'));

  if (isHTML) {
    // HTML: Network First com fallback para cache
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          // Atualiza o cache com a nova versão
          if (response && response.status === 200) {
            var responseToCache = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(function () {
          // Offline: tenta o cache
          return caches.match(event.request).then(function (cached) {
            if (cached) return cached;
            // Fallback simplificado para iOS: sempre tenta index.html
            return caches.match('/index.html');
          });
        })
    );
  } else {
    // Assets: Cache First com fallback para network
    event.respondWith(
      caches.match(event.request)
        .then(function (response) {
          if (response) {
            return response;
          }
          return fetch(event.request)
            .then(function (networkResponse) {
              // Só cacheia respostas válidas
              if (!networkResponse || networkResponse.status !== 200) {
                return networkResponse;
              }
              // Não cacheia respostas opacas de CDNs
              if (networkResponse.type === 'opaque') {
                return networkResponse;
              }
              var responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(event.request, responseToCache);
              }).catch(function () { });
              return networkResponse;
            })
            .catch(function () {
              // Asset não encontrado - retorna undefined para browser tratar
              return undefined;
            });
        })
    );
  }
});

// Sincronização em background (quando voltar online)
self.addEventListener('sync', event => {
  console.log('[Service Worker] Sincronizando em background');
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  // Aqui você pode adicionar lógica para sincronizar pedidos quando voltar online
  console.log('[Service Worker] Sincronizando pedidos...');
}

// Notificações push (opcional para futuro)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Novo pedido disponível!',
    icon: '/assets/img/icon-192.svg',
    badge: '/assets/img/icon-192.svg',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('Fast Savory\'s', options)
  );
});
