use tauri::Manager;

#[tauri::command]
fn app_ready() -> String {
  "ok".into()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("CAD Studio");
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![app_ready])
    .run(tauri::generate_context!())
    .expect("error while running CAD Studio");
}
