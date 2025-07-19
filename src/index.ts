import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// 気象庁APIのベースURL
const JMA_API_BASE = "https://www.jma.go.jp/bosai";

// 詳細天気コード定義（気象庁公式に基づく）
const DETAILED_WEATHER_CODES: Record<string, string> = {
  // 100番台: 晴れ系
  "100": "晴",
  "101": "晴時々曇",
  "102": "晴一時雨",
  "103": "晴時々雨",
  "104": "晴一時雪",
  "105": "晴時々雪",
  "106": "晴一時雨か雪",
  "107": "晴時々雨か雪",
  "108": "晴一時雨か雷雨",
  "110": "晴後時々曇",
  "111": "晴後曇",
  "112": "晴後一時雨",
  "113": "晴後時々雨",
  "114": "晴後雨",
  "115": "晴後一時雪",
  "116": "晴後時々雪",
  "117": "晴後雪",
  "118": "晴後雨か雪",
  "119": "晴後雨か雷雨",
  "120": "晴朝夕一時雨",
  "121": "晴朝の内一時雨",
  "122": "晴夕方一時雨",
  "123": "晴山沿い雷雨",
  "124": "晴山沿い雪",
  "125": "晴午後は雷雨",
  "126": "晴昼頃から雨",
  "127": "晴夕方から雨",
  "128": "晴夜は雨",
  "130": "朝の内霧後晴",
  "131": "晴明け方霧",
  "132": "晴朝夕曇",
  "140": "晴時々雨と雷雨",
  "160": "晴一時雪か雨",
  "170": "晴時々雪か雨",
  "181": "晴後雪か雨",

  // 200番台: 曇り系
  "200": "曇",
  "201": "曇時々晴",
  "202": "曇一時雨",
  "203": "曇時々雨",
  "204": "曇一時雪",
  "205": "曇時々雪",
  "206": "曇一時雨か雪",
  "207": "曇時々雨か雪",
  "208": "曇一時雨か雷雨",
  "209": "霧",
  "210": "曇後時々晴",
  "211": "曇後晴",
  "212": "曇後一時雨",
  "213": "曇後時々雨",
  "214": "曇後雨",
  "215": "曇後一時雪",
  "216": "曇後時々雪",
  "217": "曇後雪",
  "218": "曇後雨か雪",
  "219": "曇後雨か雷雨",
  "220": "曇朝夕一時雨",
  "221": "曇朝の内一時雨",
  "222": "曇夕方一時雨",
  "223": "曇日中時々晴",
  "224": "曇昼頃から雨",
  "225": "曇夕方から雨",
  "226": "曇夜は雨",
  "228": "曇昼頃から雪",
  "229": "曇夕方から雪",
  "230": "曇暁霧後晴",
  "231": "曇明け方霧",
  "240": "曇時々雨と雷雨",
  "250": "曇時々雪と雨",
  "260": "曇一時雪か雨",
  "270": "曇時々雪か雨",
  "281": "曇後雪か雨",

  // 300番台: 雨系
  "300": "雨",
  "301": "雨時々晴",
  "302": "雨時々止む",
  "303": "雨時々雪",
  "304": "雨か雪",
  "306": "大雨",
  "308": "雨で暴風を伴う",
  "309": "雨一時雪",
  "311": "雨後晴",
  "313": "雨後曇",
  "314": "雨後雪",
  "315": "雨後多少の雪",
  "316": "雨か雪後晴",
  "317": "雨か雪後曇",
  "320": "朝の内雨後晴",
  "321": "朝の内雨後曇",
  "322": "雨朝晩一時雪",
  "323": "雨昼頃から晴",
  "324": "雨夕方から晴",
  "325": "雨夜は晴",
  "326": "雨夕方から雪",
  "327": "雨夜は雪",
  "328": "雨一時強く降る",
  "329": "雨一時みぞれ",
  "340": "雪か雨",
  "350": "雨で雷を伴う",
  "361": "雪か雨後晴",
  "371": "雪か雨後曇",

  // 400番台: 雪系
  "400": "雪",
  "401": "雪時々晴",
  "402": "雪時々止む",
  "403": "雪時々雨",
  "405": "大雪",
  "406": "風雪強い",
  "407": "暴風雪",
  "409": "雪一時雨",
  "411": "雪後晴",
  "413": "雪後曇",
  "414": "雪後雨",
  "420": "朝の内雪後晴",
  "421": "朝の内雪後曇",
  "422": "雪昼頃から雨",
  "423": "雪夕方から雨",
  "425": "雪一時強く降る",
  "426": "雪後みぞれ",
  "427": "雪一時みぞれ",
  "450": "雪で雷を伴う"
};

// フォールバック用の簡易天気コード分類
const WEATHER_CODE_FALLBACK = {
  SUNNY: { min: 100, max: 199, label: "晴れ" },
  CLOUDY: { min: 200, max: 299, label: "くもり" },
  RAINY: { min: 300, max: 399, label: "雨" },
  SNOWY: { min: 400, max: Infinity, label: "雪" }
} as const;

// エラーメッセージ定義
const ERROR_MESSAGES = {
  LOCATION_NOT_FOUND: (location: string) => 
    `申し訳ありません。「${location}」の地域コードが見つかりません。都道府県名または市区町村名で指定してください。`,
  WEATHER_DATA_FAILED: "天気データの取得に失敗しました。",
  FORECAST_DATA_FAILED: "天気予報データの取得に失敗しました。",
  WEEKLY_DATA_FAILED: "週間予報データが取得できませんでした。"
} as const;

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
let areaDataLoadError: string | null = null;

// 地域データを読み込む関数（起動時専用）
function loadAreaDataOnStartup(): void {
  try {
    // スクリプトのディレクトリを基準にarea.jsonのパスを決定
    const currentFileUrl = import.meta.url;
    const currentFilePath = fileURLToPath(currentFileUrl);
    const scriptDir = path.dirname(currentFilePath);
    const projectRoot = path.dirname(scriptDir); // buildディレクトリの親（プロジェクトルート）
    const areaJsonPath = path.join(projectRoot, "area.json");
    
    // ファイルの存在確認
    if (!fs.existsSync(areaJsonPath)) {
      // プロジェクトルートで見つからない場合、現在の作業ディレクトリも試す
      const fallbackPath = path.join(process.cwd(), "area.json");
      if (!fs.existsSync(fallbackPath)) {
        areaDataLoadError = `area.jsonファイルが見つかりません。確認したパス: ${areaJsonPath}, ${fallbackPath}`;
        console.error(`Error: ${areaDataLoadError}`);
        return;
      }
      const data = fs.readFileSync(fallbackPath, "utf-8");
      areaDataCache = JSON.parse(data) as AreaData;
      console.error(`area.jsonを読み込みました: ${fallbackPath}`);
      return;
    }

    const data = fs.readFileSync(areaJsonPath, "utf-8");
    areaDataCache = JSON.parse(data) as AreaData;
    console.error(`area.jsonを読み込みました: ${areaJsonPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    areaDataLoadError = `area.jsonの読み込みに失敗しました: ${errorMessage}`;
    console.error(`Error: ${areaDataLoadError}`);
  }
}

// 地域データを取得する関数（実行時用）
function getAreaData(): AreaData | null {
  return areaDataCache;
}

// 地域階層を辿って都道府県コードと地域コードを取得する共通関数
function traverseAreaHierarchy(areaData: AreaData, cityCode: string): { regionCode: string; areaCode: string } | null {
  const class15Code = areaData.class20s[cityCode]?.parent;
  if (!class15Code) return null;
  
  const class15Info = areaData.class15s[class15Code];
  if (!class15Info) return null;

  const class10Code = class15Info.parent;
  if (!class10Code) return null;
  
  const class10Info = areaData.class10s[class10Code];
  if (!class10Info) return null;

  const regionCode = class10Info.parent;
  if (!regionCode) return null;

  return { regionCode, areaCode: class10Code };
}

// 都道府県名から都道府県コードを検索する関数
function findRegionCode(regionName: string): string | null {
  const areaData = getAreaData();
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
  const areaData = getAreaData();
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
          const hierarchy = traverseAreaHierarchy(areaData, code);
          if (hierarchy && hierarchy.regionCode === prefectureCode) {
            return {
              cityCode: code,
              regionCode: hierarchy.regionCode,
              areaCode: hierarchy.areaCode
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
      const hierarchy = traverseAreaHierarchy(areaData, code);
      if (hierarchy) {
        return {
          cityCode: code,
          regionCode: hierarchy.regionCode,
          areaCode: hierarchy.areaCode
        };
      }
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

// area.json読み込みエラーチェック関数
function checkAreaDataLoadError() {
  if (areaDataLoadError) {
    return createErrorResponse(areaDataLoadError);
  }
  return null;
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
  const prefectureCode = findRegionCode(location);
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

// 天気コード変換共通関数（詳細版）
function convertWeatherCode(weatherCode: string | undefined): string {
  if (!weatherCode) return "データなし";

  // まず詳細な天気コード辞書で検索
  const detailedWeather = DETAILED_WEATHER_CODES[weatherCode];
  if (detailedWeather) {
    return detailedWeather;
  }

  // 詳細コードが見つからない場合はフォールバック分類を使用
  const code = parseInt(weatherCode);
  for (const weather of Object.values(WEATHER_CODE_FALLBACK)) {
    if (code >= weather.min && code <= weather.max) {
      return weather.label;
    }
  }
  
  return "データなし";
}

// 指定された市区町村が属する地域のみを抽出する関数
function filterAreaByCode<T extends { area: { code: string } }>(
  areas: T[], 
  targetAreaCode: string
): T[] {
  return areas.filter(area => area.area.code === targetAreaCode);
}

// 短期予報の天気情報を処理する関数
function processShortTermWeatherInfo(
  weatherSeries: any,
  isCitySearch: boolean,
  targetAreaCode: string | null
): string {
  let weatherText = "";
  
  if (weatherSeries && weatherSeries.areas && weatherSeries.areas.length > 0) {
    const areas = isCitySearch && targetAreaCode
      ? filterAreaByCode(weatherSeries.areas, targetAreaCode)
      : weatherSeries.areas;

    for (const area of areas) {
      if (isWeatherArea(area)) {
        weatherText += `【${area.area.name}】\n`;
        for (let i = 0; i < weatherSeries.timeDefines.length; i++) {
          const date = formatDate(weatherSeries.timeDefines[i]);
          const weather = area.weathers?.[i] || "データなし";
          const wind = area.winds?.[i] || "";
          const wave = area.waves?.[i] || "";

          weatherText += `${date}: ${weather}`;
          if (wind) weatherText += ` 風: ${wind}`;
          if (wave) weatherText += ` 波: ${wave}`;
          weatherText += "\n";
        }
        weatherText += "\n";
      }
    }
  }
  
  return weatherText;
}

// 短期予報の降水確率を処理する関数
function processShortTermPrecipitation(
  popSeries: any,
  isCitySearch: boolean,
  targetAreaCode: string | null
): string {
  let precipText = "";
  
  const areas = isCitySearch && targetAreaCode
    ? filterAreaByCode(popSeries.areas, targetAreaCode)
    : popSeries.areas;

  if (areas.length > 0) {
    precipText += "【降水確率】\n";
    for (const area of areas) {
      if (hasPopProperty(area)) {
        precipText += `【${area.area.name}】\n`;

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
          precipText += `${date}:\n `;
          for (let j = 0; j < timeData.length; j++) {
            precipText += `${timeData[j].time}:${timeData[j].pop}%`;
            precipText += "\n";
          }
          precipText += "\n";
        }
        precipText += "\n";
      }
    }
    precipText += "\n";
  }
  
  return precipText;
}

// 短期予報の気温情報を処理する関数
function processShortTermTemperature(tempSeries: any): string {
  let tempText = "【気温】\n";
  
  for (const area of tempSeries.areas) {
    if (isTempArea(area)) {
      tempText += `${area.area.name}: `;
      for (let i = 0; i < tempSeries.timeDefines.length; i++) {
        const time = new Date(tempSeries.timeDefines[i]).getHours();
        const temp = area.temps?.[i] || "-";
        const label = time === 0 ? "最低" : "最高";
        tempText += `${label}:${temp}℃ `;
      }
      tempText += "\n";
    }
  }
  tempText += "\n";
  
  return tempText;
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
    // area.json読み込みエラーチェック
    const errorResponse = checkAreaDataLoadError();
    if (errorResponse) {
      return errorResponse;
    }
    
    // 地域情報を取得
    const locationInfo = getLocationInfo(location);
    if (!locationInfo) {
      return createErrorResponse(ERROR_MESSAGES.LOCATION_NOT_FOUND(location));
    }

    const { regionCode, locationName } = locationInfo;

    // 天気概況を取得
    const weatherData = await makeJmaRequest<JmaOverviewForecastResponse>("forecast/data/overview_forecast", regionCode);

    if (!weatherData) {
      return createErrorResponse(ERROR_MESSAGES.WEATHER_DATA_FAILED);
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
    // area.json読み込みエラーチェック
    const errorResponse = checkAreaDataLoadError();
    if (errorResponse) {
      return errorResponse;
    }
    
    // 地域情報を取得
    const locationInfo = getLocationInfo(location);
    if (!locationInfo) {
      return createErrorResponse(ERROR_MESSAGES.LOCATION_NOT_FOUND(location));
    }

    const { regionCode, areaCode: targetAreaCode, locationName, isCitySearch } = locationInfo;

    // 予報データを取得（短期予報と週間予報の配列で返る）
    const forecastData = await makeJmaRequest<JmaWeeklyForecastResponse>("forecast/data/forecast", regionCode);

    if (!forecastData || forecastData.length === 0) {
      return createErrorResponse(ERROR_MESSAGES.FORECAST_DATA_FAILED);
    }

    // 短期予報データ（3日間）を取得
    const shortTermData = forecastData[0];
    const formattedDate = formatDateTime(shortTermData.reportDatetime);

    let forecastText = `${locationName}の天気予報（明後日までの詳細）\n\n` +
      `発表: ${shortTermData.publishingOffice}\n` +
      `発表日時: ${formattedDate}\n\n`;

    // 短期予報の詳細データを処理
    if (shortTermData.timeSeries && shortTermData.timeSeries.length > 0) {
      // 天気情報（最初のtimeSeries）
      const weatherSeries = shortTermData.timeSeries[0];
      forecastText += processShortTermWeatherInfo(weatherSeries, isCitySearch, targetAreaCode);

      // 降水確率（2番目のtimeSeries）
      if (shortTermData.timeSeries[1]) {
        const popSeries = shortTermData.timeSeries[1];
        forecastText += processShortTermPrecipitation(popSeries, isCitySearch, targetAreaCode);
      }

      // 気温（3番目のtimeSeries）
      if (shortTermData.timeSeries[2]) {
        const tempSeries = shortTermData.timeSeries[2];
        forecastText += processShortTermTemperature(tempSeries);
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
    // area.json読み込みエラーチェック
    const errorResponse = checkAreaDataLoadError();
    if (errorResponse) {
      return errorResponse;
    }
    
    // 地域情報を取得
    const locationInfo = getLocationInfo(location);
    if (!locationInfo) {
      return createErrorResponse(ERROR_MESSAGES.LOCATION_NOT_FOUND(location));
    }

    const { regionCode, locationName } = locationInfo;

    // 予報データを取得（短期予報と週間予報の配列で返る）
    const forecastData = await makeJmaRequest<JmaWeeklyForecastResponse>("forecast/data/forecast", regionCode);

    if (!forecastData || forecastData.length === 0) {
      return createErrorResponse(ERROR_MESSAGES.FORECAST_DATA_FAILED);
    }

    // 週間予報データを取得（配列の2番目の要素）
    if (forecastData.length < 2) {
      return createErrorResponse(ERROR_MESSAGES.WEEKLY_DATA_FAILED);
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
  // 起動時にarea.jsonを読み込み
  loadAreaDataOnStartup();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Weather MCP Server failed to start:", error);
  process.exit(1);
});