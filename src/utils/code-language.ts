/**
 * 代码文件扩展名 → 高亮语言 id 映射。
 *
 * 与 Rust 端 `src-tauri/src/commands/workspace.rs` 的 `CODE_EXTENSIONS` 保持对齐：
 * 这里新增的扩展名应当同时出现在 Rust 白名单里，否则侧边栏不会显示、也无法被打开。
 *
 * 语言 id 采用 highlight.js / lowlight 的命名（见 `code-block.ts` 的注册表）。
 * 某些语言在 highlight.js 中没有对应 grammar（如 zig / csv / tex），映射为
 * `null`，编辑器会按纯文本展示（仍可正常打开与编辑）。
 */

interface CodeLanguageEntry {
  /** lowlight / highlight.js 语言 id；null 表示降级为纯文本 */
  language: string | null;
  /** 无扩展名的特殊文件名（Makefile / Dockerfile 等），按文件名匹配 */
  fileName?: string;
}

const EXTENSION_TO_LANGUAGE: Record<string, CodeLanguageEntry> = {
  // 系统 / 主流语言
  rs: { language: 'rust' },
  go: { language: 'go' },
  py: { language: 'python' },
  rb: { language: 'ruby' },
  php: { language: 'php' },
  php3: { language: 'php' },
  php4: { language: 'php' },
  php5: { language: 'php' },
  java: { language: 'java' },
  kt: { language: 'kotlin' },
  kts: { language: 'kotlin' },
  swift: { language: 'swift' },
  c: { language: 'c' },
  h: { language: 'c' },
  cpp: { language: 'cpp' },
  cc: { language: 'cpp' },
  cxx: { language: 'cpp' },
  hpp: { language: 'cpp' },
  hh: { language: 'cpp' },
  cs: { language: 'csharp' },
  m: { language: 'objectivec' },
  mm: { language: 'objectivec' },
  scala: { language: 'scala' },
  sc: { language: 'scala' },
  groovy: { language: 'groovy' },
  gvy: { language: 'groovy' },
  dart: { language: 'dart' },
  lua: { language: 'lua' },
  r: { language: 'r' },
  pl: { language: 'perl' },
  pm: { language: 'perl' },
  ex: { language: 'elixir' },
  exs: { language: 'elixir' },
  erl: { language: 'erlang' },
  hs: { language: 'haskell' },
  ml: { language: 'ocaml' },
  mli: { language: 'ocaml' },
  fs: { language: 'fsharp' },
  fsi: { language: 'fsharp' },
  fsx: { language: 'fsharp' },
  clj: { language: 'clojure' },
  cljs: { language: 'clojure' },
  cljc: { language: 'clojure' },
  jl: { language: 'julia' },
  nim: { language: 'nim' },
  cr: { language: 'crystal' },
  zig: { language: null },

  // Web / 前端
  js: { language: 'javascript' },
  jsx: { language: 'javascript' },
  mjs: { language: 'javascript' },
  cjs: { language: 'javascript' },
  ts: { language: 'typescript' },
  tsx: { language: 'typescript' },
  vue: { language: 'html' }, // Vue SFC 无标准 grammar，降级为 html
  svelte: { language: 'html' },
  html: { language: 'html' },
  htm: { language: 'html' },
  xhtml: { language: 'html' },
  css: { language: 'css' },
  scss: { language: 'scss' },
  sass: { language: 'scss' },
  less: { language: 'less' },
  json: { language: 'json' },
  jsonl: { language: 'json' },
  json5: { language: 'json' },
  jsonc: { language: 'json' },
  yaml: { language: 'yaml' },
  yml: { language: 'yaml' },
  toml: { language: 'toml' },
  xml: { language: 'xml' },
  xsl: { language: 'xml' },
  svg: { language: 'xml' },
  graphql: { language: 'graphql' },
  gql: { language: 'graphql' },
  webmanifest: { language: 'json' },

  // 数据 / 查询 / 配置
  sql: { language: 'sql' },
  mysql: { language: 'sql' },
  pgsql: { language: 'pgsql' },
  sqlite: { language: 'sql' },
  csv: { language: null },
  tsv: { language: null },
  ini: { language: 'ini' },
  conf: { language: 'ini' },
  cfg: { language: 'ini' },
  properties: { language: 'properties' },
  env: { language: 'bash' },
  dotenv: { language: 'bash' },
  tf: { language: null }, // hcl 无 grammar，降级纯文本
  tfvars: { language: null },
  hcl: { language: null },
  proto: { language: 'protobuf' },
  diff: { language: 'diff' },
  patch: { language: 'diff' },
  log: { language: null }, // 日志文件，无 grammar，按纯文本打开编辑
  logs: { language: null },

  // 脚本 / 运维
  sh: { language: 'bash' },
  bash: { language: 'bash' },
  zsh: { language: 'bash' },
  fish: { language: 'bash' },
  ps1: { language: 'powershell' },
  psm1: { language: 'powershell' },
  bat: { language: 'dos' }, // Windows 批处理，highlight.js grammar 名为 dos
  cmd: { language: 'dos' },
  nginx: { language: 'nginx' },
  apache: { language: null },
  makefile: { language: 'makefile', fileName: 'makefile' },
  gnumakefile: { language: 'makefile', fileName: 'gnumakefile' },
  mk: { language: 'makefile' },
  cmake: { language: 'cmake', fileName: 'cmakelists.txt' },
  dockerfile: { language: 'dockerfile', fileName: 'dockerfile' },

  // 其它常见
  tex: { language: null },
  rst: { language: 'markdown' },
  adb: { language: 'ada' },
  v: { language: 'verilog' },
  sv: { language: 'vhdl' },
  vhd: { language: 'vhdl' },
  asm: { language: 'x86asm' },
  nasm: { language: 'x86asm' },
  tcl: { language: 'tcl' },
  lisp: { language: 'lisp' },
  lsp: { language: 'lisp' },
  rkt: { language: null },
  coffee: { language: 'coffeescript' },
  inu: { language: null },
  stan: { language: 'stan' },
  mercury: { language: 'mercury' },
  smalltalk: { language: 'smalltalk' },
  gms: { language: 'gams' },
  ll: { language: 'llvm' },
  qml: { language: 'qml' },
  vala: { language: 'vala' },
  ada: { language: 'ada' },
  sas: { language: 'sas' },
  stata: { language: 'stata' },
};

/** 可被打开对话框 / 拖放识别的代码文件扩展名（小写，不含点）。 */
export const CODE_FILE_EXTENSIONS: string[] = Object.keys(EXTENSION_TO_LANGUAGE);

/** 按文件名匹配的特殊代码文件（无扩展名）。 */
const CODE_FILE_NAMES: Record<string, CodeLanguageEntry> = (() => {
  const map: Record<string, CodeLanguageEntry> = {};
  for (const entry of Object.values(EXTENSION_TO_LANGUAGE)) {
    if (entry.fileName) {
      map[entry.fileName] = entry;
    }
  }
  return map;
})();

/** 判断给定路径是否为可识别的代码文件（扩展名或特殊文件名）。 */
export function isCodeFilePath(path: string): boolean {
  const lower = path.toLowerCase();
  const fileName = lower.split(/[\\/]/).pop() ?? '';
  if (Object.prototype.hasOwnProperty.call(CODE_FILE_NAMES, fileName)) {
    return true;
  }
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = lower.slice(dot + 1);
  return Object.prototype.hasOwnProperty.call(EXTENSION_TO_LANGUAGE, ext);
}

/**
 * 根据文件路径推断 lowlight 语言 id。
 * 返回 null 表示没有对应 grammar，编辑器按纯文本展示。
 */
export function languageFromPath(path: string): string | null {
  const lower = path.toLowerCase();
  const fileName = lower.split(/[\\/]/).pop() ?? '';
  if (Object.prototype.hasOwnProperty.call(CODE_FILE_NAMES, fileName)) {
    return CODE_FILE_NAMES[fileName].language;
  }
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = lower.slice(dot + 1);
  return EXTENSION_TO_LANGUAGE[ext]?.language ?? null;
}

/** 拖放用的扩展名正则源（与 CODE_FILE_EXTENSIONS 对齐）。 */
export const CODE_FILE_DROP_PATTERN = new RegExp(
  `\\.(${CODE_FILE_EXTENSIONS.join('|')})$`,
  'i',
);
