import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * This file is web-only and used to configure the root HTML for every web page during static rendering.
 * The contents of this function only run in Node.js environments and do not have access to the DOM or browser APIs.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es" translate="no">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="google" content="notranslate" />

        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta id="apple-status-bar" name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="apple-mobile-web-app-title" content="Zenly" />
        {/* 
          CRÍTICO: Este script corre ANTES de que cualquier módulo JS (incluyendo Supabase)
          se cargue. Captura #type=recovery del hash de la URL y lo guarda en sessionStorage
          para que React pueda leerlo después, aunque Supabase ya haya borrado el hash.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              try {
                var hash = window.location.hash || '';
                if (hash.indexOf('type=recovery') !== -1) {
                  sessionStorage.setItem('sanctuary_password_recovery', '1');
                }
              } catch(e) {}
            })();
            `
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              var themeColors = {
                light: '#FFF8F0',
                dark: '#1A1A2E',
                lavender: '#F8F7FF',
                lavender_dark: '#1A1625',
                ocean: '#F0F9FA',
                ocean_dark: '#0A1A1A',
                snow: '#FFFFFF',
                rose: '#FFF5F5',
                rose_dark: '#1A0E0E',
                amber: '#FFFBF0',
                amber_dark: '#1A1400',
                slate: '#F5F7FA',
                midnight: '#0D0D1A'
              };
              var darkThemes = ['dark', 'lavender_dark', 'ocean_dark', 'rose_dark', 'amber_dark', 'midnight'];
              var savedTheme = 'light';
              try {
                for (var i = 0; i < localStorage.length; i++) {
                  var key = localStorage.key(i);
                  if (key && key.indexOf('user_theme_') === 0) {
                    savedTheme = localStorage.getItem(key) || 'light';
                    break;
                  }
                }
              } catch (e) {}
              var bg = themeColors[savedTheme] || '#FFF8F0';
              var isDark = darkThemes.indexOf(savedTheme) !== -1;
              
              // theme-color meta (controls Chrome/Android status bar)
              var themeMeta = document.createElement('meta');
              themeMeta.name = 'theme-color';
              themeMeta.content = bg;
              document.head.appendChild(themeMeta);

              // Apple status bar: default style
              var appleMeta = document.getElementById('apple-status-bar');
              if (appleMeta) {
                appleMeta.content = 'default';
              }
              
              var style = document.createElement('style');
              style.innerHTML = 'html, body { background-color: ' + bg + ' !important; margin: 0; padding: 0; }';
              document.head.appendChild(style);

              // Expose helper for React to call when theme changes
              window.__applyThemeColor = function(color) {
                var tc = document.querySelector('meta[name="theme-color"]');
                if (tc) tc.content = color;
                document.body.style.backgroundColor = color;
                document.documentElement.style.backgroundColor = color;
              };
            })();
            `
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(registration) {
                  console.log('ServiceWorker registrado con éxito: ', registration.scope);
                  
                  // Verificar si ya hay un service worker esperando (waiting)
                  if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                  }

                  // Detectar cuando se encuentra un nuevo service worker en instalación
                  registration.addEventListener('updatefound', function() {
                    var newWorker = registration.installing;
                    if (newWorker) {
                      newWorker.addEventListener('statechange', function() {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                          // Hay una actualización lista, forzamos skipWaiting enviando el mensaje
                          newWorker.postMessage({ type: 'SKIP_WAITING' });
                        }
                      });
                    }
                  });
                }).catch(function(err) {
                  console.log('Fallo el registro del ServiceWorker: ', err);
                });
              });

              // Recargar la página una vez que el nuevo Service Worker toma el control
              var refreshing = false;
              navigator.serviceWorker.addEventListener('controllerchange', function() {
                if (!refreshing) {
                  refreshing = true;
                  window.location.reload();
                }
              });
            }
          `,
          }}
        />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}
