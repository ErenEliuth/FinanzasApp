import React, { memo } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface TradingViewProps {
  symbol?: string;
  height?: number;
  type?: 'ticker-tape' | 'chart';
}

const TradingViewWidget = ({ symbol = 'BITSTAMP:BTCUSD', height = 100, type = 'ticker-tape' }: TradingViewProps) => {
  const html = type === 'ticker-tape' 
    ? `
      <!DOCTYPE html>
      <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0; background: transparent;">
          <div class="tradingview-widget-container">
            <div class="tradingview-widget-container__widget"></div>
            <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js" async>
            {
              "symbols": [
                { "proName": "BITSTAMP:BTCUSD", "title": "Bitcoin" },
                { "proName": "FX_IDC:USDCBOP", "title": "USD/COP" },
                { "proName": "NASDAQ:AAPL", "title": "Apple" },
                { "proName": "BINANCE:ETHUSDT", "title": "Ethereum" },
                { "proName": "BVC:ECOPETROL", "title": "Ecopetrol" }
              ],
              "showSymbolLogo": true,
              "colorTheme": "dark",
              "isTransparent": true,
              "displayMode": "adaptive",
              "locale": "es"
            }
            </script>
          </div>
        </body>
      </html>
    `
    : `
      <!DOCTYPE html>
      <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;">
          <div class="tradingview-widget-container" style="height:100vh; width:100vw;">
            <div id="tradingview_chart"></div>
            <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
            <script type="text/javascript">
              new TradingView.widget({
                "autosize": true,
                "symbol": "${symbol}",
                "interval": "D",
                "timezone": "Etc/UTC",
                "theme": "dark",
                "style": "1",
                "locale": "es",
                "toolbar_bg": "#f1f3f6",
                "enable_publishing": false,
                "hide_side_toolbar": false,
                "allow_symbol_change": true,
                "container_id": "tradingview_chart"
              });
            </script>
          </div>
        </body>
      </html>
    `;

  if (Platform.OS === 'web') {
    return (
      <View style={{ height, width: '100%', overflow: 'hidden' }}>
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="TradingView"
        />
      </View>
    );
  }

  return (
    <View style={{ height, width: '100%' }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ backgroundColor: 'transparent' }}
      />
    </View>
  );
};

export default memo(TradingViewWidget);
