# Weather MCP Server

このプロジェクトは、Model Context Protocol (MCP) を使用して天気情報を提供するサーバーです。アメリカ国立気象サービス (National Weather Service) のAPIを利用して、特定の地域の天気予報や気象警報を取得できます。

## 機能

このサーバーは以下の2つの主要な機能を提供します：

1. **州ごとの気象警報取得** - アメリカの州コードを指定して、現在アクティブな気象警報を取得
2. **位置ベースの天気予報** - 緯度と経度を指定して、その場所の天気予報を取得

## 前提条件

- Node.js (v14以上)
- npm または yarn

## インストールとビルド

このリポジトリをクローンした後、以下のコマンドを実行してください：

```bash
# 依存パッケージのインストール
npm install

# TypeScriptのビルド
npm run build
```

これにより、`src` ディレクトリのTypeScriptコードがコンパイルされ、`build` ディレクトリに出力されます。

## 実行方法

ビルド後、以下のコマンドでサーバーを起動できます：

```bash
node build/index.js
```

このサーバーは標準入出力（stdio）を使用して通信するため、通常は単体で実行するのではなく、Claude for DesktopなどのMCPクライアントから利用します。

## Claude for Desktopとの統合

Claude for Desktopで使用するには、以下のように設定ファイルを編集してください：

1. Claude for Desktopの設定ファイルを開く：
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. 以下の設定を追加（パスは絶対パスで指定）：

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/absolute/path/to/weather/build/index.js"]
    }
  }
}
```

3. Claude for Desktopを再起動

## 利用例

サーバーが起動すると、MCPクライアントから以下のような質問ができるようになります：

- 「カリフォルニアの気象警報を教えて」(get-alertsツールがCAのデータを取得)
- 「サンフランシスコの天気予報は？」(get-forecastツールが緯度・経度を使用)

## 制限事項

- このサーバーは米国の天気データのみを提供します（api.weather.gov APIを使用）
- 天気予報の取得には正確な緯度・経度が必要です
- すべてのリクエストにはインターネット接続が必要です

## ライセンス

ISCライセンス
