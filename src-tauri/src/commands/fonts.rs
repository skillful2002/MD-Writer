//! 枚举系统中实际已安装的字体，供前端「字体族」下拉列表使用。
//!
//! 这样下拉里的每一项都对应本机真实存在的字体，避免「选了但显示没变」
//! （原因是该字体未安装、被 CSS 兜底链回退）的问题。
//!
//! - macOS：通过 Core Text 真实枚举已安装字体 family。
//! - Windows / Linux：返回该平台常见预装字体白名单（这些系统预装字体相对固定）。

#[cfg(target_os = "macos")]
pub fn enumerate_system_fonts() -> Vec<String> {
    use std::collections::BTreeSet;
    use std::ptr;

    use objc2_core_text::{CTFont, CTFontCollection, CTFontDescriptor};

    let mut seen = BTreeSet::new();
    let mut result: Vec<String> = Vec::new();

    // 获取系统已注册字体的集合
    let collection = unsafe { CTFontCollection::from_available_fonts(None) };
    if let Some(descriptors) = unsafe { collection.matching_font_descriptors() } {
        let count = descriptors.count();
        for i in 0..count {
            // value_at_index 返回裸指针，需转回 CTFontDescriptor 引用
            let raw = unsafe { descriptors.value_at_index(i) } as *const CTFontDescriptor;
            if raw.is_null() {
                continue;
            }
            let desc = unsafe { &*raw };
            // 由 descriptor 构造一个 CTFont（size 0、无变换矩阵），读取 family 名
            let font = unsafe { CTFont::with_font_descriptor(desc, 0.0, ptr::null()) };
            let name = unsafe { font.family_name().to_string() };

            if name.is_empty()
                || name.eq_ignore_ascii_case(".LastResort")
                || name.eq_ignore_ascii_case(".SF NS Document")
            {
                continue;
            }
            if seen.insert(name.clone()) {
                result.push(name);
            }
        }
    }

    result
}

#[cfg(target_os = "windows")]
pub fn enumerate_system_fonts() -> Vec<String> {
    vec![
        "Segoe UI".to_string(),
        "Microsoft YaHei".to_string(),
        "Microsoft JhengHei".to_string(),
        "SimSun".to_string(),
        "SimHei".to_string(),
        "NSimSun".to_string(),
        "KaiTi".to_string(),
        "Consolas".to_string(),
        "Courier New".to_string(),
        "Lucida Console".to_string(),
        "Arial".to_string(),
        "Tahoma".to_string(),
        "Verdana".to_string(),
        "Times New Roman".to_string(),
        "Georgia".to_string(),
        "Calibri".to_string(),
        "Cambria".to_string(),
    ]
}

#[cfg(target_os = "linux")]
pub fn enumerate_system_fonts() -> Vec<String> {
    vec![
        "DejaVu Sans".to_string(),
        "DejaVu Sans Mono".to_string(),
        "Liberation Sans".to_string(),
        "Liberation Serif".to_string(),
        "Liberation Mono".to_string(),
        "Noto Sans".to_string(),
        "Noto Sans CJK SC".to_string(),
        "Noto Serif".to_string(),
        "Ubuntu".to_string(),
        "Cantarell".to_string(),
        "FreeSans".to_string(),
        "FreeMono".to_string(),
        "WenQuanYi Micro Hei".to_string(),
        "WenQuanYi Zen Hei".to_string(),
        "Sans Serif".to_string(),
        "Serif".to_string(),
        "Monospace".to_string(),
    ]
}

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    enumerate_system_fonts()
}
