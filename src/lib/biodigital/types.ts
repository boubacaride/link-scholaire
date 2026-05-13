// ─── BioDigital Human API Types ───────────────────────────────

// Viewer iframe UI options
export interface ViewerUIOptions {
  "ui-all"?: boolean;
  "ui-nav"?: boolean;
  "ui-reset"?: boolean;
  "ui-menu"?: boolean;
  "ui-tools"?: boolean;
  "ui-search"?: boolean;
  "ui-fullscreen"?: boolean;
  "ui-help"?: boolean;
  "ui-media-controls"?: "none" | "small" | "full";
  "ui-audio"?: boolean;
  "ui-info"?: boolean;
  "ui-tour"?: boolean;
  "ui-chapter-list"?: boolean;
  "ui-label-list"?: boolean;
  "ui-anatomy-descriptions"?: boolean;
  "ui-anatomy-labels"?: boolean;
  "ui-collapse-label"?: number;
  "ui-whiteboard"?: boolean;
  "ui-context-menu"?: boolean;
}

// Camera
export interface CameraInfo {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  fov: number;
}

export interface CameraSetParams {
  position?: { x: number; y: number; z: number };
  target?: { x: number; y: number; z: number };
  up?: { x: number; y: number; z: number };
  animate?: boolean;
}

export interface CameraOrbitParams {
  yaw?: number;
  pitch?: number;
}

export interface CameraPanParams {
  x?: number;
  y?: number;
}

export interface CameraZoomParams {
  delta?: number;
  percentage?: number;
}

// Scene
export interface SceneObject {
  objectId: string;
  name: string;
  visible?: boolean;
  selected?: boolean;
}

export interface HighlightParams {
  objectId: string;
  color?: string;
  opacity?: number;
}

export interface ColorParams {
  objectId: string;
  color: string;
  opacity?: number;
}

export interface XRayParams {
  enabled: boolean;
  objectIds?: string[];
}

// Labels
export interface LabelData {
  labelId: string;
  objectId: string;
  text: string;
  position?: { x: number; y: number; z: number };
}

export interface CreateLabelParams {
  objectId: string;
  text: string;
  position?: { x: number; y: number; z: number };
}

// Timeline / Chapters
export interface ChapterInfo {
  chapterId: string;
  name: string;
  description?: string;
  index: number;
}

export interface TimelineInfo {
  playing: boolean;
  speed: number;
  currentTime: number;
  duration: number;
  currentChapter?: ChapterInfo;
}

// Input / Pick
export interface PickResult {
  objectId: string;
  name: string;
  position: { x: number; y: number; z: number };
}

// UI
export interface SnapshotData {
  image: string; // base64 data URL
}

export interface BackgroundParams {
  color?: string;
  gradient?: [string, string];
}

// Quiz
export interface QuizQuestion {
  questionId: string;
  text: string;
  objectId?: string;
  type: "identify" | "label" | "select";
}

export interface QuizResult {
  correct: boolean;
  score: number;
  total: number;
}

// Content API
export interface ContentModel {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  slug?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ContentCollection {
  id: string;
  name: string;
  description?: string;
  modelCount?: number;
}

export interface OAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// HumanAPI core interface
export interface IHumanAPI {
  send(message: string, callback?: (data: any) => void): void;
  send(message: string, params: any, callback?: (data: any) => void): void;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback?: (data: any) => void): void;
}

// Global declaration for the HumanAPI constructor
declare global {
  interface Window {
    HumanAPI: new (iframeId: string) => IHumanAPI;
  }
}
