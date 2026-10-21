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
  comm?: CommTask; // 微型交流任务（API 下发时合并；试点 20 单元）
}

export type Rating = "again" | "hard" | "good" | "easy";
export type UnitStatus = "new" | "learning" | "review" | "active" | "mastered";

// ============ 微型交流任务（Context 维度的交流闭环） ============
// 与后端 learn.xiyuzero.com/types 的 CommTask 镜像，修改时两端同步。
// 判分规则为教师式标注（规则式 MVP，未接入 AI，不伪造智能评分）。

export interface CommTask {
  /** 「我能……」交流目标（中文） */
  goal: string;
  /** 情境说明（中文；展示给用户的任务背景） */
  scenario: string;
  /** 交流要求（中文；用户需要表达什么） */
  task: string;
  /** 判分规则（教师式标注） */
  check: {
    key: { label: string; any: string[] }[];
    rejects?: { message: string; any: string[] }[];
    target?: { label: string; any: string[] };
  };
  /** 参考表达（提交后展示；不是唯一合法答案） */
  reference: string[];
  /** 追问（对方输入西语 + 中文；考察理解与临场回应） */
  followUp?: {
    prompt: string;
    promptZh: string;
    task: string;
    check: {
      key: { label: string; any: string[] }[];
      rejects?: { message: string; any: string[] }[];
      target?: { label: string; any: string[] };
    };
    reference: string[];
  };
  /** 迁移任务（改变角色/目的/信息量；复习期出现，不与首学同题） */
  transfer?: {
    scenario: string;
    task: string;
    check: {
      key: { label: string; any: string[] }[];
      rejects?: { message: string; any: string[] }[];
      target?: { label: string; any: string[] };
    };
    reference: string[];
  };
  /** 常见错误提示（中文） */
  commonErrors?: string[];
}

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
  // ---- Phase 4 可选字段（向后兼容：旧数据/旧端无这些字段时回退到总体 recall）----
  meaningCorrect?: number; // 含义回忆（C→S）正确次数
  meaningTotal?: number; // 含义回忆总次数
  chunkCorrect?: number; // 词块回忆正确次数
  chunkTotal?: number; // 词块回忆总次数
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
