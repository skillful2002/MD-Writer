use crate::events::emit_menu_event;
use std::collections::HashMap;
use std::fs;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Manager;

fn accelerator(
    shortcuts: &HashMap<String, String>,
    command_id: &str,
    default: Option<&str>,
) -> Option<String> {
    shortcuts
        .get(command_id)
        .cloned()
        .or_else(|| default.map(str::to_string))
}

fn build_menu(
    app: &tauri::AppHandle,
    shortcuts: &HashMap<String, String>,
) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let about_accel = accelerator(shortcuts, "help.about", None);
    let settings_accel = accelerator(shortcuts, "settings.open", Some("CmdOrCtrl+,"));
    let quit_accel = accelerator(shortcuts, "app.quit", Some("CmdOrCtrl+Q"));

    let new_accel = accelerator(shortcuts, "file.new", Some("CmdOrCtrl+N"));
    let new_window_accel = accelerator(shortcuts, "file.newWindow", Some("CmdOrCtrl+Alt+N"));
    let open_accel = accelerator(shortcuts, "file.open", Some("CmdOrCtrl+O"));
    let save_accel = accelerator(shortcuts, "file.save", Some("CmdOrCtrl+S"));
    let save_as_accel = accelerator(shortcuts, "file.saveAs", Some("CmdOrCtrl+Shift+S"));
    let export_html_accel = accelerator(shortcuts, "export.html", None);
    let export_pdf_accel = accelerator(shortcuts, "export.pdf", Some("CmdOrCtrl+Shift+P"));
    let export_wechat_accel = accelerator(shortcuts, "export.wechat", Some("CmdOrCtrl+E"));

    let undo_accel = accelerator(shortcuts, "editor.undo", Some("CmdOrCtrl+Z"));
    let redo_accel = accelerator(shortcuts, "editor.redo", Some("CmdOrCtrl+Shift+Z"));
    let find_accel = accelerator(shortcuts, "edit.find", Some("CmdOrCtrl+F"));
    let replace_accel = accelerator(shortcuts, "edit.replace", Some("CmdOrCtrl+H"));
    let palette_accel = accelerator(shortcuts, "edit.commandPalette", Some("CmdOrCtrl+K"));

    let toggle_sidebar_accel = accelerator(shortcuts, "view.toggleSidebar", Some("CmdOrCtrl+\\"));
    let show_outline_accel = accelerator(shortcuts, "view.showOutline", Some("CmdOrCtrl+Alt+1"));
    let toggle_source_accel = accelerator(shortcuts, "view.toggleSourceMode", Some("CmdOrCtrl+/"));
    let focus_mode_accel = accelerator(shortcuts, "view.focusMode", Some("CmdOrCtrl+Shift+F"));
    let fullscreen_accel = accelerator(shortcuts, "view.fullscreen", Some("CmdOrCtrl+Ctrl+F"));

    let shortcuts_accel = accelerator(shortcuts, "help.shortcuts", Some("CmdOrCtrl+Shift+K"));

    let app_menu = Submenu::with_items(
        app,
        "MarkdownEd",
        true,
        &[
            &MenuItem::with_id(
                app,
                "help.about",
                "关于 MarkdownEd",
                true,
                about_accel.as_deref(),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "settings.open",
                "设置...",
                true,
                settings_accel.as_deref(),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("服务"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "app.hide", "隐藏 MarkdownEd", true, Some("CmdOrCtrl+H"))?,
            &MenuItem::with_id(
                app,
                "app.hideOthers",
                "隐藏其他",
                true,
                Some("CmdOrCtrl+Alt+H"),
            )?,
            &MenuItem::with_id(app, "app.showAll", "显示全部", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "app.quit",
                "退出 MarkdownEd",
                true,
                quit_accel.as_deref(),
            )?,
        ],
    )?;

    let recents = read_recent_folders(app);
    let recent_files = read_recent_files(app);
    let menu_limit = read_recent_menu_limit(app);
    let has_recents = !recents.is_empty();
    let has_recent_files = !recent_files.is_empty();
    let mut history_owned: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    if !has_recents && !has_recent_files {
        history_owned.push(Box::new(MenuItem::with_id(app, "file.openRecent.empty", "（无历史记录）", false, None::<&str>)?));
    } else {
        // 最近打开的文件夹
        for (i, (recent_path, recent_name)) in recents.iter().take(menu_limit).enumerate() {
            let label = if recent_name.is_empty() {
                recent_path.clone()
            } else {
                recent_name.clone()
            };
            history_owned.push(Box::new(MenuItem::with_id(app, format!("file.openRecent.{i}"), label, true, None::<&str>)?));
        }
        // 最近打开的文件
        if has_recent_files {
            if has_recents {
                history_owned.push(Box::new(PredefinedMenuItem::separator(app)?));
                history_owned.push(Box::new(MenuItem::with_id(app, "file.openRecentFile.header", "最近打开的文件", false, None::<&str>)?));
            }
            for (i, (file_path, file_name)) in recent_files.iter().take(menu_limit).enumerate() {
                let label = if file_name.is_empty() {
                    file_path.clone()
                } else {
                    file_name.clone()
                };
                history_owned.push(Box::new(MenuItem::with_id(app, format!("file.openRecentFile.{i}"), label, true, None::<&str>)?));
            }
        }
    }
    history_owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    history_owned.push(Box::new(MenuItem::with_id(app, "file.clearRecent", "清除历史记录", has_recents || has_recent_files, None::<&str>)?));
    let history_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        history_owned.iter().map(|b| b.as_ref()).collect();
    let history_submenu = Submenu::with_items(app, "打开历史记录", true, &history_refs)?;

    let file_new = MenuItem::with_id(app, "file.new", "新建", true, new_accel.as_deref())?;
    let file_new_window = MenuItem::with_id(app, "file.newWindow", "新建窗口", true, new_window_accel.as_deref())?;
    let file_open = MenuItem::with_id(app, "file.open", "打开...", true, open_accel.as_deref())?;
    let file_open_folder = MenuItem::with_id(app, "file.openFolder", "打开文件夹...", true, None::<&str>)?;
    let file_close_folder = MenuItem::with_id(app, "file.closeFolder", "关闭文件夹", true, None::<&str>)?;
    let file_save = MenuItem::with_id(app, "file.save", "保存", true, save_accel.as_deref())?;
    let file_save_as = MenuItem::with_id(app, "file.saveAs", "另存为...", true, save_as_accel.as_deref())?;
    let export_html = MenuItem::with_id(app, "export.html", "导出为 HTML", true, export_html_accel.as_deref())?;
    let export_pdf = MenuItem::with_id(app, "export.pdf", "导出为 PDF...", true, export_pdf_accel.as_deref())?;
    let export_wechat = MenuItem::with_id(app, "export.wechat", "微信导出", true, export_wechat_accel.as_deref())?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let file_items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = vec![
        &file_new,
        &file_new_window,
        &file_open,
        &file_open_folder,
        &history_submenu,
        &file_close_folder,
        &sep1,
        &file_save,
        &file_save_as,
        &sep2,
        &export_html,
        &export_pdf,
        &export_wechat,
    ];
    let file_menu = Submenu::with_items(app, "文件", true, &file_items)?;

    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &MenuItem::with_id(app, "editor.undo", "撤销", true, undo_accel.as_deref())?,
            &MenuItem::with_id(app, "editor.redo", "重做", true, redo_accel.as_deref())?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("剪切"))?,
            &PredefinedMenuItem::copy(app, Some("复制"))?,
            &PredefinedMenuItem::paste(app, Some("粘贴"))?,
            &PredefinedMenuItem::select_all(app, Some("全选"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "edit.find", "查找", true, find_accel.as_deref())?,
            &MenuItem::with_id(app, "edit.replace", "替换", true, replace_accel.as_deref())?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "edit.commandPalette",
                "命令面板",
                true,
                palette_accel.as_deref(),
            )?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "视图",
        true,
        &[
            &MenuItem::with_id(
                app,
                "view.showOutline",
                "大纲",
                true,
                show_outline_accel.as_deref(),
            )?,
            &MenuItem::with_id(
                app,
                "view.toggleSidebar",
                "文件树",
                true,
                toggle_sidebar_accel.as_deref(),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &CheckMenuItem::with_id(
                app,
                "view.toggleSourceMode",
                "源码模式",
                true,
                false,
                toggle_source_accel.as_deref(),
            )?,
            &MenuItem::with_id(
                app,
                "view.focusMode",
                "焦点模式",
                true,
                focus_mode_accel.as_deref(),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "view.fullscreen",
                "全屏",
                true,
                fullscreen_accel.as_deref(),
            )?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "帮助",
        true,
        &[
            &MenuItem::with_id(
                app,
                "help.shortcuts",
                "快捷键",
                true,
                shortcuts_accel.as_deref(),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "help.github", "项目主页 (GitHub)", true, None::<&str>)?,
            &MenuItem::with_id(app, "help.gitee", "项目主页 (Gitee)", true, None::<&str>)?,
            &MenuItem::with_id(app, "help.issues", "报告问题", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "help.diagnostics",
                "打开启动诊断日志",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu],
    )
}

fn read_recent_folders(app: &tauri::AppHandle) -> Vec<(String, String)> {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let path = dir.join("history.json");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let arr = match value.get("recentFolders").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Vec::new(),
    };
    arr.iter()
        .filter_map(|item| {
            let path = item.get("path").and_then(|v| v.as_str())?.to_string();
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            Some((path, name))
        })
        .collect()
}

/// 读取历史文件记录（recentFiles），与 read_recent_folders 对称。
/// 这些项会作为「打开历史记录」子菜单中「最近打开的文件」分组展示，
/// 命令 id 形如 file.openRecentFile.<index>。
fn read_recent_files(app: &tauri::AppHandle) -> Vec<(String, String)> {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let path = dir.join("history.json");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let arr = match value.get("recentFiles").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Vec::new(),
    };
    arr.iter()
        .filter_map(|item| {
            let path = item.get("path").and_then(|v| v.as_str())?.to_string();
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            Some((path, name))
        })
        .collect()
}

/// 读取设置中「菜单中显示的历史记录条数」(recentFoldersInMenu)，默认 10。
/// 该值同时限制「打开历史记录」子菜单中文件夹与文件两个分组的展示数量。
/// 位于 settings.json 的 { "settings": { "recentFoldersInMenu": N } }。
fn read_recent_menu_limit(app: &tauri::AppHandle) -> usize {
    const DEFAULT_LIMIT: usize = 10;
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return DEFAULT_LIMIT,
    };
    let path = dir.join("settings.json");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return DEFAULT_LIMIT,
    };
    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return DEFAULT_LIMIT,
    };
    match value
        .get("settings")
        .and_then(|s| s.get("recentFoldersInMenu"))
        .and_then(|n| n.as_u64())
    {
        Some(n) if n >= 1 => n as usize,
        _ => DEFAULT_LIMIT,
    }
}

pub fn setup_menu(
    app: &tauri::AppHandle,
    shortcuts: &HashMap<String, String>,
) -> Result<(), tauri::Error> {
    let menu = build_menu(app, shortcuts)?;
    app.set_menu(menu)?;
    Ok(())
}

pub fn attach_menu_events(app: &tauri::AppHandle) {
    app.on_menu_event(move |app, event| {
        let menu_id = event.id().as_ref().to_string();
        match menu_id {
            ref id if id == "app.hide" || id == "app.hideOthers" || id == "app.showAll" => {}
            _ => {
                emit_menu_event(app, menu_id);
            }
        }
    });
}
