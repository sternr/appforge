// ─── App Status ───
export type AppStatus = 'draft' | 'generating' | 'ready' | 'error';

// ─── Chat messages ───
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Clarification Q&A ───
export interface ClarificationQuestion {
  question: string;
  options: string[];
}

export interface ClarificationAnswer {
  question: string;
  answer: string;
}

// ─── App Spec ───
export interface ScreenSpec {
  id: string;
  name: string;
  purpose: string;
  wireframe: string;
  components: string[];
  interactions: string[];
}

export interface FlowSpec {
  id: string;
  name: string;
  steps: string[];
  fromScreen: string;
  toScreen: string;
}

export interface DesignSystemSpec {
  colorPalette: Record<string, string>;
  typography: { heading: string; body: string };
  spacing: string;
  borderRadius: string;
  style: string;
}

export interface TestCase {
  id: string;
  type: 'ui' | 'functional' | 'regression';
  description: string;
  steps: string[];
  expected: string;
  status: 'pending' | 'pass' | 'fail';
  failureReason?: string;
}

export interface AppSpec {
  screens: ScreenSpec[];
  flows: FlowSpec[];
  designSystem: DesignSystemSpec;
  testCases: TestCase[];
}

// ─── App Metadata (stored in apps table) ───
export interface AppMetadata {
  id: string;
  name: string;
  icon: string;
  prompt: string;
  clarifications: ClarificationAnswer[];
  status: AppStatus;
  createdAt: number;
  updatedAt: number;
  version: number;
  spec?: AppSpec;
  installedOnHomescreen: boolean;
  errorMessage?: string;
}

// ─── App Code (stored separately) ───
export interface AppCode {
  appId: string;
  html: string;
  version: number;
  sizeBytes: number;
}

// ─── Settings ───
export interface SettingsEntry {
  key: string;
  value: string;
}

// ─── Pipeline ───
export type PipelinePhase =
  | 'idle'
  | 'clarifying'
  | 'planning'
  | 'designing'
  | 'coding'
  | 'testing'
  | 'agent-testing'
  | 'iterating'
  | 'done'
  | 'error';

export interface PipelineState {
  phase: PipelinePhase;
  appId: string | null;
  progress: number;
  currentStepDetail: string;
  streamingContent: string;
  testResults: TestCase[];
  iterationCount: number;
  error?: string;
  generatedHtml: string;
}

export const PIPELINE_PHASES: { phase: PipelinePhase; label: string }[] = [
  { phase: 'clarifying', label: 'Clarifying requirements' },
  { phase: 'planning', label: 'Planning spec' },
  { phase: 'designing', label: 'Designing UX' },
  { phase: 'coding', label: 'Writing code' },
  { phase: 'testing', label: 'Running tests' },
  { phase: 'agent-testing', label: 'Agent testing' },
  { phase: 'iterating', label: 'Fixing issues' },
  { phase: 'done', label: 'Complete' },
];
