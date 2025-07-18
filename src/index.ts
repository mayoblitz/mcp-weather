import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

// 気象庁APIのベースURL
const JMA_API_BASE = "https://www.jma.go.jp/bosai";

// 地域データの型定義
interface AreaData {
  centers: Record<string, { name: string; enName: string; officeName?: string }>;
  offices: Record<string, { name: string; enName: string; officeName?: string; parent?: string }>;
  class10s: Record<string, { name: string; enName: string; parent?: string }>;
  class15s: Record<string, { name: string; enName: string; parent?: string }>;
  class20s: Record<string, { name: string; enName: string; parent?: string; kana?: string }>;
}

// 地域データをキャッシュ
let areaDataCache: AreaData | null = null;

// 地域データを読み込む関数
function loadAreaData(): AreaData | null {
  if (areaDataCache) {
    return areaDataCache;
  }

  try {
    const areaJsonPath = path.join(process.cwd(), "area.json");
    const data = fs.readFileSync(areaJsonPath, "utf-8");
    areaDataCache = JSON.parse(data) as AreaData;
    return areaDataCache;
  } catch (error) {
    console.error("Failed to load area.json:", error);
    return null;
  }
}

// 都道府県名から都道府県コードを検索する関数
function findRegionCode(regionName: string): string | null {
  const areaData = loadAreaData();
  if (!areaData) {
    return null;
  }

  // 都道府県（offices）のみから検索
  for (const [code, info] of Object.entries(areaData.offices)) {
    if (info.name === regionName || info.name.includes(regionName)) {
      return code;
    }
  }

  return null;
}

// 市区町村名から対応する地域コードを検索する関数
function findCityCode(cityName: string): { cityCode: string; regionCode: string; areaCode: string } | null {
  const areaData = loadAreaData();
  if (!areaData) {
    return null;
  }

  // 「都道府県名+市区町村名」の形式で検索（例：広島県府中市）
  const prefectureCityMatch = cityName.match(/^(.+?[都道府県])(.+)$/);
  if (prefectureCityMatch) {
    const prefectureName = prefectureCityMatch[1];
    const cityNameOnly = prefectureCityMatch[2];
    
    // 都道府県コードを取得
    const prefectureCode = findRegionCode(prefectureName);
    if (prefectureCode) {
      // 該当都道府県内の市区町村を検索
      for (const [code, info] of Object.entries(areaData.class20s)) {
        if (info.name === cityNameOnly || info.name.includes(cityNameOnly)) {
          // 親階層を辿って都道府県コードが一致するかチェック
          const class15Code = info.parent;
          if (!class15Code) continue;
          
          const class15Info = areaData.class15s?.[class15Code];
          if (!class15Info) continue;

          const class10Code = class15Info.parent;
          if (!class10Code) continue;
          
          const class10Info = areaData.class10s?.[class10Code];
          if (!class10Info) continue;

          const regionCode = class10Info.parent;
          if (!regionCode) continue;

          // 都道府県が一致する場合のみ返す
          if (regionCode === prefectureCode) {
            return {
              cityCode: code,
              regionCode: regionCode,
              areaCode: class10Code
            };
          }
        }
      }
    }
    return null;
  }

  // 通常の市区町村名検索（従来通り）
  for (const [code, info] of Object.entries(areaData.class20s)) {
    if (info.name === cityName || info.name.includes(cityName)) {
      // 親階層を辿って都道府県コードを取得
      const class15Code = info.parent;
      if (!class15Code) continue;

      const class15Info = areaData.class15s?.[class15Code];
      if (!class15Info) continue;

      const class10Code = class15Info.parent;
      if (!class10Code) continue;

      const class10Info = areaData.class10s?.[class10Code];
      if (!class10Info) continue;

      const regionCode = class10Info.parent;
      if (!regionCode) continue;

      return {
        cityCode: code,
        regionCode: regionCode,
        areaCode: class10Code
      };
    }
  }

  return null;
}

// 天気概況インターフェース
interface JmaOverviewForecastResponse {
  publishingOffice: string; // 発表元
  reportDatetime: string;   // 発表日時
  targetArea: string;       // 対象地域
  headlineText: string;     // 見出し
  text: string;             // 詳細テキスト
}

// 気象庁API予報データのインターフェース（3日間予報と週間予報を含む）
type JmaWeeklyForecastResponse = JmaWeeklyForecastItem[];

interface JmaWeeklyForecastItem {
  publishingOffice: string;
  reportDatetime: string;
  timeSeries: JmaTimeSeries[];
  tempAverage?: { areas: JmaAreaValue[] };
  precipAverage?: { areas: JmaAreaValue[] };
}

// 天気データエリア
interface JmaWeatherArea {
  area: { name: string; code: string };
  weatherCodes?: string[];
  weathers?: string[];
  winds?: string[];
  waves?: string[];
  pops?: string[];
  reliabilities?: string[];
}

// 気温データエリア
interface JmaTempArea {
  area: { name: string; code: string };
  temps?: string[];
  tempsMin?: string[];
  tempsMax?: string[];
  tempsMinUpper?: string[];
  tempsMinLower?: string[];
  tempsMaxUpper?: string[];
  tempsMaxLower?: string[];
}

// 降水確率データエリア
interface JmaPrecipArea {
  area: { name: string; code: string };
  pops?: string[];
}

interface JmaTimeSeries {
  timeDefines: string[];
  areas: (JmaWeatherArea | JmaTempArea | JmaPrecipArea)[];
}

interface JmaAreaValue {
  area: { name: string; code: string };
  min: string;
  max: string;
}

// 型ガード関数
function isWeatherArea(area: JmaWeatherArea | JmaTempArea | JmaPrecipArea): area is JmaWeatherArea {
  return 'weathers' in area || 'weatherCodes' in area || 'winds' in area || 'waves' in area;
}

function isTempArea(area: JmaWeatherArea | JmaTempArea | JmaPrecipArea): area is JmaTempArea {
  return 'temps' in area || 'tempsMin' in area || 'tempsMax' in area;
}

function isPrecipArea(area: JmaWeatherArea | JmaTempArea | JmaPrecipArea): area is JmaPrecipArea {
  return 'pops' in area && !('weathers' in area) && !('temps' in area) && !('tempsMin' in area);
}

function hasPopProperty(area: JmaWeatherArea | JmaTempArea | JmaPrecipArea): area is JmaWeatherArea | JmaPrecipArea {
  return 'pops' in area;
}

// APIリクエスト用のヘルパー関数
async function makeJmaRequest<T>(endpoint: string, regionCode: string): Promise<T | null> {
  const url = `${JMA_API_BASE}/${endpoint}/${regionCode}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`JMA API request failed: ${response.status} for ${url}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`JMA API request error for ${url}:`, error);
    return null;
  }
}

// 共通のエラーレスポンス生成関数
function createErrorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
  };
}

// 都道府県コード検証の共通関数
function validateRegionCode(region: string): string | null {
  const regionCode = findRegionCode(region);
  if (!regionCode) {
    return null;
  }
  return regionCode;
}

// 都道府県名または市区町村名から地域情報を取得する共通関数
function getLocationInfo(location: string): { regionCode: string; areaCode: string | null; locationName: string; isCitySearch: boolean } | null {
  // まず市区町村として検索
  const cityInfo = findCityCode(location);
  if (cityInfo) {
    // 市区町村が見つかった場合
    return {
      regionCode: cityInfo.regionCode,
      areaCode: cityInfo.areaCode,
      locationName: location,
      isCitySearch: true
    };
  }

  // 都道府県として検索
  const prefectureCode = validateRegionCode(location);
  if (prefectureCode) {
    return {
      regionCode: prefectureCode,
      areaCode: null,
      locationName: location,
      isCitySearch: false
    };
  }

  return null;
}

// 日付フォーマット共通関数
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? "不明" : date.toLocaleString("ja-JP");
}

// 日付フォーマット共通関数（日付のみ）
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ja-JP");
}

// 週間予報用日付フォーマット共通関数
function formatWeeklyDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ja-JP", {
    month: "numeric", day: "numeric", weekday: "short"
  });
}

// 天気コード変換共通関数
function convertWeatherCode(weatherCode: string | undefined): string {
  if (!weatherCode) return "データなし";

  const code = parseInt(weatherCode);
  if (code >= 100 && code < 200) return "晴れ";
  else if (code >= 200 && code < 300) return "くもり";
  else if (code >= 300 && code < 400) return "雨";
  else if (code >= 400) return "雪";
  return "データなし";
}

// MCPサーバーインスタンスを作成
const server = new McpServer({
  name: "weather",
  version: "1.0.0",
});


// 日本の都道府県・市区町村の天気概況を取得するツール
server.tool(
  "overview-forecast",
  "日本の都道府県または市区町村の天気概況を取得",
  {
    location: z.string().describe("都道府県名または市区町村名 (例: 愛知県, 稲沢市, 東京都, 渋谷区など)"),
  },
  async ({ location }) => {
    // 地域情報を取得
    const locationInfo = getLocationInfo(location);
    if (!locationInfo) {
      return createErrorResponse(`申し訳ありません。「${location}」の地域コードが見つかりません。都道府県名または市区町村名で指定してください。`);
    }

    const { regionCode, locationName } = locationInfo;

    // 天気概況を取得
    const weatherData = await makeJmaRequest<JmaOverviewForecastResponse>("forecast/data/overview_forecast", regionCode);

    if (!weatherData) {
      return createErrorResponse("天気データの取得に失敗しました。");
    }

    // 日時のフォーマット
    const formattedDate = formatDateTime(weatherData.reportDatetime);

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

// 日本の都道府県・市区町村の短期天気予報を取得するツール（明後日まで）
server.tool(
  "short-forecast",
  "日本の都道府県または市区町村の短期天気予報を取得（明後日まで）",
  {
    location: z.string().describe("都道府県名または市区町村名 (例: 愛知県, 稲沢市, 東京都, 渋谷区など)"),
  },
  async ({ location }) => {
    // 地域情報を取得
    const locationInfo = getLocationInfo(location);
    if (!locationInfo) {
      return createErrorResponse(`申し訳ありません。「${location}」の地域コードが見つかりません。都道府県名または市区町村名で指定してください。`);
    }

    const { regionCode, areaCode: targetAreaCode, locationName, isCitySearch } = locationInfo;

    // 予報データを取得（短期予報と週間予報の配列で返る）
    const forecastData = await makeJmaRequest<JmaWeeklyForecastResponse>("forecast/data/forecast", regionCode);

    if (!forecastData || forecastData.length === 0) {
      return createErrorResponse("天気予報データの取得に失敗しました。");
    }

    // 短期予報データ（3日間）を取得
    const shortTermData = forecastData[0];
    const formattedDate = formatDateTime(shortTermData.reportDatetime);

    let forecastText = `${locationName}の天気予報（明後日までの詳細）\n\n` +
      `発表: ${shortTermData.publishingOffice}\n` +
      `発表日時: ${formattedDate}\n\n`;

    // 指定された市区町村が属する地域のみを抽出（市区町村検索の場合のみ）
    function filterAreaByCode(areas: any[], targetAreaCode: string): any[] {
      return areas.filter(area => area.area.code === targetAreaCode);
    }

    // 短期予報の詳細データを処理
    if (shortTermData.timeSeries && shortTermData.timeSeries.length > 0) {
      // 天気情報（最初のtimeSeries）
      const weatherSeries = shortTermData.timeSeries[0];
      if (weatherSeries && weatherSeries.areas && weatherSeries.areas.length > 0) {
        const areas = isCitySearch && targetAreaCode
          ? filterAreaByCode(weatherSeries.areas, targetAreaCode)
          : weatherSeries.areas;

        for (const area of areas) {
          if (isWeatherArea(area)) {
            forecastText += `【${area.area.name}】\n`;
            for (let i = 0; i < weatherSeries.timeDefines.length; i++) {
              const date = formatDate(weatherSeries.timeDefines[i]);
              const weather = area.weathers?.[i] || "データなし";
              const wind = area.winds?.[i] || "";
              const wave = area.waves?.[i] || "";

              forecastText += `${date}: ${weather}`;
              if (wind) forecastText += ` 風: ${wind}`;
              if (wave) forecastText += ` 波: ${wave}`;
              forecastText += "\n";
            }
            forecastText += "\n";
          }
        }
      }

      // 降水確率（2番目のtimeSeries）
      if (shortTermData.timeSeries[1]) {
        const popSeries = shortTermData.timeSeries[1];
        const areas = isCitySearch && targetAreaCode
          ? filterAreaByCode(popSeries.areas, targetAreaCode)
          : popSeries.areas;

        if (areas.length > 0) {
          forecastText += "【降水確率】\n";
          for (const area of areas) {
            if (hasPopProperty(area)) {
              forecastText += `【${area.area.name}】\n`;

              // 降水確率を日付ごとにグループ化
              const popByDate: Record<string, { time: string; pop: string }[]> = {};
              for (let i = 0; i < popSeries.timeDefines.length; i++) {
                const dateTime = new Date(popSeries.timeDefines[i]);
                const date = formatDate(popSeries.timeDefines[i]);
                const hour = dateTime.getHours();
                const endHour = (hour + 6) % 24;
                const timeRange = `${hour}-${endHour}時`;
                const pop = area.pops?.[i] || "-";

                if (!popByDate[date]) {
                  popByDate[date] = [];
                }
                popByDate[date].push({ time: timeRange, pop });
              }

              // 各日付の降水確率を時間帯で表示
              for (const [date, timeData] of Object.entries(popByDate)) {
                forecastText += `${date}:\n `;
                for (let j = 0; j < timeData.length; j++) {
                  forecastText += `${timeData[j].time}:${timeData[j].pop}%`;
                  forecastText += "\n";
                }
                forecastText += "\n";
              }
              forecastText += "\n";
            }
          }
          forecastText += "\n";
        }
      }

      // 気温（3番目のtimeSeries）
      if (shortTermData.timeSeries[2]) {
        const tempSeries = shortTermData.timeSeries[2];
        forecastText += "【気温】\n";
        for (const area of tempSeries.areas) {
          if (isTempArea(area)) {
            forecastText += `${area.area.name}: `;
            for (let i = 0; i < tempSeries.timeDefines.length; i++) {
              const time = new Date(tempSeries.timeDefines[i]).getHours();
              const temp = area.temps?.[i] || "-";
              const label = time === 0 ? "最低" : "最高";
              forecastText += `${label}:${temp}℃ `;
            }
            forecastText += "\n";
          }
        }
        forecastText += "\n";
      }
    }

    return {
      content: [{ type: "text", text: forecastText }],
    };
  }
);

// 日本の都道府県・市区町村の週間天気予報を取得するツール（6日先まで）
server.tool(
  "weekly-forecast",
  "日本の都道府県または市区町村の週間天気予報を取得（6日先まで）",
  {
    location: z.string().describe("都道府県名または市区町村名 (例: 愛知県, 稲沢市, 東京都, 渋谷区など)"),
  },
  async ({ location }) => {
    // 地域情報を取得
    const locationInfo = getLocationInfo(location);
    if (!locationInfo) {
      return createErrorResponse(`申し訳ありません。「${location}」の地域コードが見つかりません。都道府県名または市区町村名で指定してください。`);
    }

    const { regionCode, locationName } = locationInfo;

    // 予報データを取得（短期予報と週間予報の配列で返る）
    const forecastData = await makeJmaRequest<JmaWeeklyForecastResponse>("forecast/data/forecast", regionCode);

    if (!forecastData || forecastData.length === 0) {
      return createErrorResponse("天気予報データの取得に失敗しました。");
    }

    // 週間予報データを取得（配列の2番目の要素）
    if (forecastData.length < 2) {
      return createErrorResponse("週間予報データが取得できませんでした。");
    }

    const weeklyData = forecastData[1];
    const weeklyFormattedDate = formatDateTime(weeklyData.reportDatetime);
    let forecastText = `${locationName}の天気予報（６日先まで）\n` +
      `発表日時: ${weeklyFormattedDate}\n\n`;

    if (weeklyData.timeSeries && weeklyData.timeSeries.length > 0) {
      // 週間天気・降水確率（最初のtimeSeries）
      const weeklyWeatherSeries = weeklyData.timeSeries[0];
      if (weeklyWeatherSeries && weeklyWeatherSeries.areas && weeklyWeatherSeries.areas.length > 0) {
        const area = weeklyWeatherSeries.areas[0];
        if (isWeatherArea(area)) {
          forecastText += `【${area.area.name}】\n`;

          for (let i = 0; i < weeklyWeatherSeries.timeDefines.length; i++) {
            const date = formatWeeklyDate(weeklyWeatherSeries.timeDefines[i]);
            const weatherCode = area.weatherCodes?.[i];
            const pop = area.pops?.[i] || "-";
            const reliability = area.reliabilities?.[i] || "";

            // 天気コードから簡易的な天気表現を作成
            const weather = convertWeatherCode(weatherCode);

            forecastText += `${date}: ${weather}`;
            if (pop !== "" && pop !== "-") forecastText += ` (降水確率:${pop}%)`;
            if (reliability) forecastText += ` [信頼度:${reliability}]`;
            forecastText += "\n";
          }
          forecastText += "\n";
        }
      }

      // 週間気温（2番目のtimeSeries）
      if (weeklyData.timeSeries[1]) {
        const weeklyTempSeries = weeklyData.timeSeries[1];
        forecastText += "【週間気温】\n";

        for (const area of weeklyTempSeries.areas) {
          if (isTempArea(area)) {
            forecastText += `${area.area.name}:\n`;

            for (let i = 0; i < weeklyTempSeries.timeDefines.length; i++) {
              const date = formatWeeklyDate(weeklyTempSeries.timeDefines[i]);

              const tempMin = area.tempsMin?.[i] || "-";
              const tempMax = area.tempsMax?.[i] || "-";
              const tempMinLower = area.tempsMinLower?.[i] || "";
              const tempMinUpper = area.tempsMinUpper?.[i] || "";
              const tempMaxLower = area.tempsMaxLower?.[i] || "";
              const tempMaxUpper = area.tempsMaxUpper?.[i] || "";

              forecastText += `  ${date}: `;
              if (tempMin !== "" && tempMin !== "-") {
                forecastText += `最低${tempMin}℃`;
                if (tempMinLower && tempMinUpper && tempMinLower !== tempMin && tempMinUpper !== tempMin) {
                  forecastText += `(${tempMinLower}-${tempMinUpper}℃)`;
                }
              }
              if (tempMax !== "" && tempMax !== "-") {
                if (tempMin !== "" && tempMin !== "-") forecastText += " / ";
                forecastText += `最高${tempMax}℃`;
                if (tempMaxLower && tempMaxUpper && tempMaxLower !== tempMax && tempMaxUpper !== tempMax) {
                  forecastText += `(${tempMaxLower}-${tempMaxUpper}℃)`;
                }
              }
              forecastText += "\n";
            }
            forecastText += "\n";
          }
        }
      }

      // 平年値情報
      if (weeklyData.tempAverage) {
        forecastText += "【気温平年値参考】\n";
        for (const area of weeklyData.tempAverage.areas) {
          forecastText += `${area.area.name}: 最低${area.min}℃ / 最高${area.max}℃\n`;
        }
        forecastText += "\n";
      }

      // 降水量平年値情報
      if (weeklyData.precipAverage) {
        forecastText += "【降水量平年値参考】\n";
        for (const area of weeklyData.precipAverage.areas) {
          forecastText += `${area.area.name}: ${area.min}mm～${area.max}mm\n`;
        }
      }
    }

    return {
      content: [{ type: "text", text: forecastText }],
    };
  }
);

// サーバーを起動
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Weather MCP Server failed to start:", error);
  process.exit(1);
});