// ============================================================
// 复用自 Web 端 xiyuzero-learn/types/index.ts（2026-09-18 快照）
// 两端必须保持一致：Web 端修改后同步此文件（或未来抽共享包）
// ============================================================

export type Level = "Starter" | "A1" | "A2" | "B1" | "B2";

// ============ 5D 单词学习法 ============
// D1 Meaning 最常用中文含义
// D2 Sound   西班牙语发音 + 重音
// D3 Grammar 冠词、阴阳性、词性、必要语法
// D4 Chunk   高频搭配 / 词块
// D5 Sentence 真实高频例句
export interface FiveDItem {
  spanish: string;
  chinese: string;
}

export interface FiveD {
  meaning: string; // D1：只给最重要的一个意思
  sound: {
    syllables: string; // 音节划分，如 "ha-blar"
    stress: string; // 重音说明，如 "重音在最后一个音节 blar"
  };
  grammar: string[]; // D3：逐条语法点，如 ["定冠词 la（阴性）", "复数 las casas"]
  chunks: FiveDItem[]; // D4：高频搭配/词块（带中文）
  sentences: FiveDItem[]; // D5：真实高频例句（1-3 个，符合等级）
}

export type UnitType =
  | "word"
  | "phrase"
  | "chunk"
  | "collocation"
  | "connector"
  | "sentence-pattern";

export interface LearningUnit {
  id: string;
  level: Level;
  type: UnitType;
  spanish: string;
  lemma: string;
  chinese: string;
  partOfSpeech: string;
  article?: string;
  gender?: "m" | "f";
  plural?: string;
  topic: string;
  frequency: string;
  difficulty: number; // 1-5
  collocations: string[];
  example: { spanish: string; chinese: string };
  wordFamily: string[];
  synonyms: string[];
  antonyms: string[];
  grammarNote: string;
  commonMistakes: string;
  fiveD?: FiveD; // 5D 数据（API 下发时合并）
}

export type Rating = "again" | "hard" | "good" | "easy";
export type UnitStatus = "new" | "learning" | "review" | "active" | "mastered";

export interface ReviewState {
  status: UnitStatus;
  interval: number; // days
  dueDate: string; // ISO datetime
  correctCount: number;
  wrongCount: number;
  productionCorrect: number;
  productionWrong: number;
  productionDays: string[]; // distinct days with correct C→S
  lastRatedAt?: string;
}

export interface DayActivity {
  newLearned: number;
  reviewed: number;
  listening: number;
  output: number;
  recallCorrect: number;
  recallTotal: number;
  listeningCorrect: number;
  listeningTotal: number;
  wrongIds: string[];
}

export interface MySentence {
  id: string;
  text: string;
  date: string;
  unitIds: string[];
}

export interface Settings {
  dailyNew: number;
  targetLevel: Level;
  voiceLocale: "es-MX" | "es-ES";
  voiceGender: "female" | "male";
  rate: number; // 0.7 | 0.85 | 1.0
  tracks: string[]; // Travel / Social / Business
  goal: string;
}

export interface AppState {
  onboarded: boolean;
  startLevel: Level;
  settings: Settings;
  reviews: Record<string, ReviewState>;
  favorites: string[];
  mySentences: MySentence[];
  activity: Record<string, DayActivity>; // key: YYYY-MM-DD
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 20,
  targetLevel: "B2",
  voiceLocale: "es-MX",
  voiceGender: "female",
  rate: 0.85,
  tracks: [],
  goal: "综合西班牙语",
};

export const DEFAULT_STATE: AppState = {
  onboarded: false,
  startLevel: "Starter",
  settings: DEFAULT_SETTINGS,
  reviews: {},
  favorites: [],
  mySentences: [],
  activity: {},
};

// ============ 小程序端新增：API DTO 类型 ============

/** 服务端用户（/api/auth/wechat 与 /api/me 返回） */
export interface ServerUser {
  id: string;
  nickname: string;
  avatar: string | null;
  isNew: boolean;
}

/** GET /api/units 返回条目（词库浏览用精简版） */
export interface UnitSummary {
  id: string;
  level: Level;
  spanish: string;
  chinese: string;
  partOfSpeech: string;
  topic: string;
}

/** GET /api/units?ids= 学习会话用完整版（含 5D） */
export type UnitFull = LearningUnit;

export interface UnitsPage {
  items: UnitSummary[];
  total: number;
  level: string;
  page: number;
  pageSize: number;
}
