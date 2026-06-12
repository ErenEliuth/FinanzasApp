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
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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
              
              var meta = document.createElement('meta');
              meta.name = 'theme-color';
              meta.content = bg;
              document.head.appendChild(meta);
              
              var style = document.createElement('style');
              style.innerHTML = 'html, body { background-color: ' + bg + ' !important; }';
              document.head.appendChild(style);
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
                  console.log('ServiceWorker registration successful with scope: ', registration.scope);
                }, function(err) {
                  console.log('ServiceWorker registration failed: ', err);
                });
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
