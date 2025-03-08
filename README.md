# Weather MCP Server

このプロジェクトは、Model Context Protocol (MCP) を使用して日本の天気情報を提供するサーバーです。気象庁のAPIを利用して、日本の主要都市の天気概況や週間予報を取得できます。

## 機能

このサーバーは以下の2つの主要な機能を提供します：

1. **地域の天気概況取得** - 日本の主要都市（東京、大阪、札幌など）の天気概況を取得
2. **地域の週間予報取得** - 日本の主要都市の週間天気予報を取得

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

- 「東京の天気概況を教えて」(get-japan-weatherツールが東京のデータを取得)
- 「大阪の週間予報は？」(get-japan-weekly-forecastツールが大阪の予報を取得)
- 「札幌の天気はどう？」(get-japan-weatherツールが札幌のデータを取得)

## 対応地域

以下の主要都市に対応しています：
- 東京、大阪、名古屋、福岡、札幌、仙台、新潟、広島、那覇、千葉、横浜、神戸、京都

## 制限事項

- 日本の天気データは気象庁のAPIを使用しており、上記の主要都市のみ対応しています
- すべてのリクエストにはインターネット接続が必要です

## ライセンス

ISCライセンス
