import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 気象庁APIのベースURL
const JMA_API_BASE = "https://www.jma.go.jp/bosai";

// 各地域のコードマッピング
const REGION_CODES: Record<string, string> = {
  "東京": "130000",
  "大阪": "270000",
  "名古屋": "230000",
  "福岡": "400000",
  "札幌": "016000",
  "仙台": "040000",
  "新潟": "150000",
  "広島": "340000",
  "那覇": "471000",
  "千葉": "120000",
  "横浜": "140000",
  "神戸": "280000",
  "京都": "260000"
};

// 天気概況インターフェース
interface WeatherOverview {
  publishingOffice: string; // 発表元
  reportDatetime: string;   // 発表日時
  targetArea: string;       // 対象地域
  headlineText: string;     // 見出し
  text: string;             // 詳細テキスト
}

// 週間予報インターフェース
interface WeeklyForecast {
  publishingOffice: string; // 発表元
  reportDatetime: string;   // 発表日時
  headlineText: string;     // 見出し
  timeSeriesArray: Array<{
    timeDefines: string[];
    areas: Array<{
      area: { name: string };
      weatherCodes: string[];
      weathers: string[];
      winds: string[];
      waves: string[];
      temps: string[];
      reliabilities: string[];
    }>;
  }>;
}

// APIリクエスト用のヘルパー関数
async function makeJmaRequest<T>(endpoint: string, regionCode: string): Promise<T | null> {
  const url = `${JMA_API_BASE}/${endpoint}/${regionCode}.json`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making JMA request:", error);
    return null;
  }
}

// Create server instance
const server = new McpServer({
  name: "weather",
  version: "1.0.0",
});

// 日本の地域の天気概況を取得するツール
server.tool(
  "get-japan-weather",
  "日本の地域の天気概況を取得",
  {
    region: z.string().describe("地域名 (例: 東京, 大阪, 札幌)"),
  },
  async ({ region }) => {
    // 地域コードを取得
    const regionCode = REGION_CODES[region];
    if (!regionCode) {
      return {
        content: [{ 
          type: "text", 
          text: `申し訳ありません。「${region}」の地域コードが見つかりません。対応している地域: ${Object.keys(REGION_CODES).join(", ")}` 
        }],
      };
    }
    
    // 天気概況を取得
    const weatherData = await makeJmaRequest<WeatherOverview>("forecast/data/overview_forecast", regionCode);
    
    if (!weatherData) {
      return {
        content: [{ type: "text", text: "天気データの取得に失敗しました。" }],
      };
    }
    
    // 日時のフォーマット
    const publishDate = new Date(weatherData.reportDatetime);
    const formattedDate = publishDate.toLocaleString("ja-JP");
    
    // 結果を整形
    const weatherText = `${weatherData.targetArea}の天気概況:\n\n` +
      `発表: ${weatherData.publishingOffice}\n` +
      `発表日時: ${formattedDate}\n\n` +
      `【見出し】\n${weatherData.headlineText || "特になし"}\n\n` +
      `【詳細】\n${weatherData.text}`;
    
    return {
      content: [{ type: "text", text: weatherText }],
    };
  }
);

// 日本の地域の週間予報を取得するツール
server.tool(
  "get-japan-weekly-forecast",
  "日本の地域の週間予報を取得",
  {
    region: z.string().describe("地域名 (例: 東京, 大阪, 札幌)"),
  },
  async ({ region }) => {
    // 地域コードを取得
    const regionCode = REGION_CODES[region];
    if (!regionCode) {
      return {
        content: [{ 
          type: "text", 
          text: `申し訳ありません。「${region}」の地域コードが見つかりません。対応している地域: ${Object.keys(REGION_CODES).join(", ")}` 
        }],
      };
    }
    
    // 週間予報を取得
    const forecastData = await makeJmaRequest<WeeklyForecast>("forecast/data/forecast", regionCode);
    
    if (!forecastData) {
      return {
        content: [{ type: "text", text: "週間予報の取得に失敗しました。" }],
      };
    }
    
    // 日時のフォーマット
    const publishDate = new Date(forecastData.reportDatetime);
    const formattedDate = publishDate.toLocaleString("ja-JP");
    
    // 結果を整形
    let forecastText = `${region}の週間予報:\n\n` +
      `発表: ${forecastData.publishingOffice}\n` +
      `発表日時: ${formattedDate}\n\n`;
    
    if (forecastData.headlineText) {
      forecastText += `【見出し】\n${forecastData.headlineText}\n\n`;
    }
    
    // 時系列データを抽出
    if (forecastData.timeSeriesArray && forecastData.timeSeriesArray.length > 0) {
      const timeSeriesData = forecastData.timeSeriesArray[0];
      const timeDefines = timeSeriesData.timeDefines;
      const areas = timeSeriesData.areas;
      
      if (areas && areas.length > 0) {
        const areaData = areas[0];
        forecastText += `【${areaData.area.name}の予報】\n`;
        
        for (let i = 0; i < timeDefines.length; i++) {
          const date = new Date(timeDefines[i]).toLocaleDateString("ja-JP");
          forecastText += `${date}: ${areaData.weathers[i] || "不明"}\n`;
          
          if (areaData.temps && areaData.temps[i]) {
            forecastText += `気温: ${areaData.temps[i]}℃\n`;
          }
          
          if (areaData.winds && areaData.winds[i]) {
            forecastText += `風: ${areaData.winds[i]}\n`;
          }
          
          forecastText += "---\n";
        }
      }
    }
    
    return {
      content: [{ type: "text", text: forecastText }],
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});