use crate::error::AppError;
use crate::models::{
    PathResult, WorkspaceEntryCreateKind, WorkspaceEntryDto, WorkspaceEntryHandle,
    WorkspaceEntryKind,
};
use crate::state::WorkspaceWatcherState;
use std::fs;
use std::path::Path;
use tauri::State;

const MARKDOWN_EXTENSIONS: [&str; 2] = ["md", "markdown"];
const TEXT_EXTENSIONS: [&str; 1] = ["txt"];
const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
/// 可打开并做语法高亮的源代码 / 配置文件扩展名。
/// 这里只列举扩展名；对应高亮语言 id 映射在前端 `src/utils/code-language.ts`。
const CODE_EXTENSIONS: &[&str] = &[
    // 系统 / 主流语言
    "rs", "go", "py", "rb", "php", "php3", "php4", "php5", "java", "kt", "kts", "swift", "c", "h",
    "cpp", "cc", "cxx", "hpp", "hh", "cs", "m", "mm", "scala", "sc", "groovy", "gvy", "dart", "lua",
    "r", "pl", "pm", "ex", "exs", "erl", "hs", "ml", "mli", "fs", "fsi", "fsx", "clj", "cljs", "cljc",
    "jl", "nim", "cr", "zig",
    // Web / 前端
    "js", "jsx", "mjs", "cjs", "ts", "tsx", "vue", "svelte", "html", "htm", "xhtml", "css", "scss",
    "sass", "less", "json", "jsonl", "json5", "jsonc", "yaml", "yml", "toml", "xml", "xsl", "svg",
    "graphql", "gql", "webmanifest", "vue",
    // 数据 / 查询 / 配置
    "sql", "mysql", "pgsql", "sqlite", "csv", "tsv", "ini", "conf", "cfg", "properties", "env",
    "dotenv", "tf", "tfvars", "hcl", "proto", "diff", "patch",
    // 脚本 / 运维
    "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd", "makefile", "mk", "cmake", "nginx",
    "apache", "dockerfile", "log", "logs",
    // 其它常见
    "tex", "rst", "adb", "v", "sv", "vhd", "asm", "nasm", "tcl", "lisp", "lsp", "rkt", "coffee",
    "inu", "stan", "mercury", "smalltalk", "gms", "ll", "qml", "vala", "ada", "sas", "stata",
];

pub fn is_code_extension(extension: &str) -> bool {
    let lower = extension.to_ascii_lowercase();
    CODE_EXTENSIONS.contains(&lower.as_str())
}

#[tauri::command]
pub fn list_workspace_entries(root_path: String) -> Result<Vec<WorkspaceEntryDto>, AppError> {
    let entries = fs::read_dir(&root_path)?;
    let mut workspace_entries = Vec::new();

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        let Some(path_str) = path.to_str() else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().to_string();

        let kind = if metadata.is_dir() {
            WorkspaceEntryKind::Directory
        } else if let Some(kind) = file_kind_from_path(&path) {
            kind
        } else {
            continue;
        };

        workspace_entries.push(WorkspaceEntryDto {
            name,
            path: path_str.to_string(),
            kind,
        });
    }

    workspace_entries.sort_by(|left, right| match (&left.kind, &right.kind) {
        (WorkspaceEntryKind::Directory, WorkspaceEntryKind::Directory)
        | (WorkspaceEntryKind::Markdown, WorkspaceEntryKind::Markdown)
        | (WorkspaceEntryKind::Text, WorkspaceEntryKind::Text)
        | (WorkspaceEntryKind::Image, WorkspaceEntryKind::Image)
        | (WorkspaceEntryKind::Code, WorkspaceEntryKind::Code) => {
            left.name.to_lowercase().cmp(&right.name.to_lowercase())
        }
        (WorkspaceEntryKind::Directory, _) => std::cmp::Ordering::Less,
        (_, WorkspaceEntryKind::Directory) => std::cmp::Ordering::Greater,
        _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
    });

    Ok(workspace_entries)
}

#[tauri::command]
pub fn create_workspace_entry(
    parent_path: String,
    kind: WorkspaceEntryCreateKind,
    name: String,
) -> Result<WorkspaceEntryHandle, AppError> {
    validate_workspace_name(&name)?;
    let path = Path::new(&parent_path).join(&name);
    if path.exists() {
        return Err(AppError::validation("目标名称已存在"));
    }

    match kind {
        WorkspaceEntryCreateKind::File => {
            fs::write(&path, [])?;
        }
        WorkspaceEntryCreateKind::Folder => {
            fs::create_dir(&path)?;
        }
    }

    Ok(WorkspaceEntryHandle {
        path: path.to_string_lossy().to_string(),
        kind,
    })
}

#[tauri::command]
pub fn rename_workspace_entry(path: String, new_name: String) -> Result<PathResult, AppError> {
    validate_workspace_name(&new_name)?;
    let current_path = Path::new(&path);
    let parent = current_path
        .parent()
        .ok_or_else(|| AppError::validation("无法获取父目录"))?;
    let next_path = parent.join(new_name);
    if next_path.exists() {
        return Err(AppError::validation("目标名称已存在"));
    }

    fs::rename(current_path, &next_path)?;

    Ok(PathResult {
        path: next_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn trash_workspace_entry(path: String) -> Result<(), AppError> {
    trash::delete(path).map_err(|error| AppError::Io(error.to_string()))
}

#[tauri::command]
pub fn watch_workspace(
    state: State<'_, WorkspaceWatcherState>,
    root_path: String,
) -> Result<(), AppError> {
    state.watch(root_path)
}

#[tauri::command]
pub fn unwatch_workspace(
    state: State<'_, WorkspaceWatcherState>,
    root_path: String,
) -> Result<(), AppError> {
    state.unwatch(root_path)
}

fn file_kind_from_path(path: &Path) -> Option<WorkspaceEntryKind> {
    // 无扩展名的特殊文件名（Makefile / Dockerfile / CMakeLists.txt 等）
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .unwrap_or_default();
    match file_name.as_str() {
        "makefile" | "dockerfile" | "cmakelists.txt" | "gnumakefile" => {
            return Some(WorkspaceEntryKind::Code);
        }
        _ => {}
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())?;

    if MARKDOWN_EXTENSIONS.contains(&extension.as_str()) {
        return Some(WorkspaceEntryKind::Markdown);
    }
    if TEXT_EXTENSIONS.contains(&extension.as_str()) {
        return Some(WorkspaceEntryKind::Text);
    }
    if IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Some(WorkspaceEntryKind::Image);
    }
    if is_code_extension(&extension) {
        return Some(WorkspaceEntryKind::Code);
    }

    None
}

fn validate_workspace_name(name: &str) -> Result<(), AppError> {
    if name.trim().is_empty() {
        return Err(AppError::validation("名称不能为空"));
    }
    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(AppError::validation("名称包含非法路径字符"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{create_workspace_entry, is_code_extension, list_workspace_entries, rename_workspace_entry};
    use crate::models::{WorkspaceEntryCreateKind, WorkspaceEntryKind};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(1);

    fn test_dir() -> PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        let seq = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("markdown-ed-workspace-test-{}-{}", millis, seq));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn list_workspace_entries_filters_to_supported_types() {
        let dir = test_dir();
        fs::write(dir.join("a.md"), b"# demo").unwrap();
        fs::write(dir.join("b.txt"), b"plain").unwrap();
        fs::write(dir.join("c.svg"), b"<svg />").unwrap();
        fs::write(dir.join("skip.pdf"), b"%PDF").unwrap();
        fs::write(dir.join("main.rs"), b"fn main() {}").unwrap();
        fs::write(dir.join("data.json"), b"{}").unwrap();
        fs::write(dir.join("query.sql"), b"select 1;").unwrap();
        fs::create_dir(dir.join("notes")).unwrap();

        let entries = list_workspace_entries(dir.to_string_lossy().to_string()).unwrap();

        assert_eq!(entries.len(), 7);
        assert_eq!(entries[0].kind, WorkspaceEntryKind::Directory);
        assert_eq!(entries[1].kind, WorkspaceEntryKind::Markdown);
        assert_eq!(entries[2].kind, WorkspaceEntryKind::Text);
        assert_eq!(entries[3].kind, WorkspaceEntryKind::Image);
        assert_eq!(entries[4].kind, WorkspaceEntryKind::Code);
        assert_eq!(entries[5].kind, WorkspaceEntryKind::Code);
        assert_eq!(entries[6].kind, WorkspaceEntryKind::Code);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn is_code_extension_recognizes_source_and_data_files() {
        assert!(is_code_extension("rs"));
        assert!(is_code_extension("RS"));
        assert!(is_code_extension("ts"));
        assert!(is_code_extension("json"));
        assert!(is_code_extension("jsonl"));
        assert!(is_code_extension("sql"));
        assert!(is_code_extension("go"));
        assert!(!is_code_extension("md"));
        assert!(!is_code_extension("txt"));
        assert!(!is_code_extension("pdf"));
    }

    #[test]
    fn create_and_rename_workspace_entries_validate_names() {
        let dir = test_dir();

        let created = create_workspace_entry(
            dir.to_string_lossy().to_string(),
            WorkspaceEntryCreateKind::File,
            "demo.md".to_string(),
        )
        .unwrap();
        assert!(created.path.ends_with("demo.md"));

        let renamed = rename_workspace_entry(created.path, "renamed.md".to_string()).unwrap();
        assert!(renamed.path.ends_with("renamed.md"));

        let invalid = create_workspace_entry(
            dir.to_string_lossy().to_string(),
            WorkspaceEntryCreateKind::Folder,
            "../bad".to_string(),
        );
        assert!(invalid.is_err());

        let _ = fs::remove_dir_all(dir);
    }
}
