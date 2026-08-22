#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentOpenResult {
    pub path: String,
    pub content: String,
    pub last_modified_ms: u64,
    /// 文件实际解码所用的编码名称(如 "utf-8" / "gb18030")。
    /// 当文件并非 UTF-8 时, 前端据此在保存时把内容转回原编码写回, 避免静默改变文件编码。
    pub encoding: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSaveResult {
    pub path: String,
    pub last_modified_ms: u64,
    /// 回写时实际使用的编码名称, 便于前端核对。
    pub encoding: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentImageImportResult {
    pub relative_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentImageResolveResult {
    pub absolute_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageAssetAuthorizationResult {
    pub path: String,
}

#[derive(
    Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash,
)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceChangeKind {
    Create,
    Modify,
    Remove,
    Other,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChangedPayload {
    pub root_path: String,
    pub kind: WorkspaceChangeKind,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceEntryKind {
    Directory,
    Markdown,
    Text,
    Image,
    Code,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceEntryCreateKind {
    File,
    Folder,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntryDto {
    pub name: String,
    pub path: String,
    pub kind: WorkspaceEntryKind,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntryHandle {
    pub path: String,
    pub kind: WorkspaceEntryCreateKind,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathResult {
    pub path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AppOpenSource {
    Startup,
    Cli,
    OsOpen,
    SingleInstance,
    NewWindow,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppOpenPathsPayload {
    pub paths: Vec<String>,
    pub source: AppOpenSource,
}
