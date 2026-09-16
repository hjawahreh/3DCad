use serde::Serialize;
use std::io::Read;
use std::path::PathBuf;
use std::time::Instant;
use tauri::ipc::Response;
use tauri::Manager;

#[tauri::command]
fn app_ready() -> String {
  "ok".into()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeometryWorkerPostMeta {
  status: u16,
  content_type: String,
  host_http_ms: f64,
  host_read_ms: f64,
  byte_length: usize,
  #[serde(skip_serializing_if = "Option::is_none")]
  frame_path: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  json_text: Option<String>,
  delivery: String,
}

fn worker_temp_dir() -> PathBuf {
  std::env::temp_dir().join("cad-studio-geometry")
}

/// GEO-001H: host-side POST to the VTK worker. Large CGF1 bodies are staged to a
/// temp file; the webview then pulls raw bytes via `geometry_frame_bytes`
/// (`tauri::ipc::Response`) so Chromium never performs the multi‑MB HTTP transfer.
#[tauri::command]
fn geometry_worker_post(
  worker_url: String,
  body_json: String,
  accept: String,
) -> Result<GeometryWorkerPostMeta, String> {
  let base = worker_url.trim_end_matches('/');
  let url = format!("{base}/v1/geometry");

  // Prefer file staging for binary results when the request asks for binary.
  let mut body = body_json;
  if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&body) {
    if v.get("result_format").and_then(|x| x.as_str()) == Some("binary")
      && v.get("result_delivery").is_none()
    {
      v.as_object_mut()
        .map(|o| o.insert("result_delivery".into(), serde_json::Value::String("file".into())));
      if let Ok(s) = serde_json::to_string(&v) {
        body = s;
      }
    }
  }

  let t_http = Instant::now();
  let resp = ureq::post(&url)
    .set("Content-Type", "application/json")
    .set("Accept", &accept)
    .send_string(&body)
    .map_err(|e| format!("geometry worker unreachable: {e}"))?;
  let status = resp.status();
  let content_type = resp
    .header("Content-Type")
    .unwrap_or("application/octet-stream")
    .to_string();
  let mut bytes = Vec::new();
  resp
    .into_reader()
    .read_to_end(&mut bytes)
    .map_err(|e| format!("geometry worker read failed: {e}"))?;
  let host_http_ms = t_http.elapsed().as_secs_f64() * 1000.0;

  // Worker may return tiny JSON with frame_path (file staging).
  if content_type.to_lowercase().contains("json") {
    if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) {
      if let Some(path) = v.get("frame_path").and_then(|p| p.as_str()) {
        let t_read = Instant::now();
        let file_bytes =
          std::fs::read(path).map_err(|e| format!("frame_path read failed: {e}"))?;
        let _ = std::fs::remove_file(path);
        let host_read_ms = t_read.elapsed().as_secs_f64() * 1000.0;
        let dir = worker_temp_dir();
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let staged = dir.join(format!("ipc-{}.cgf1", uuid_like()));
        std::fs::write(&staged, &file_bytes).map_err(|e| e.to_string())?;
        return Ok(GeometryWorkerPostMeta {
          status,
          content_type: "application/vnd.clinical.geometry-frame".into(),
          host_http_ms,
          host_read_ms,
          byte_length: file_bytes.len(),
          frame_path: Some(staged.to_string_lossy().into_owned()),
          json_text: None,
          delivery: "tauri-ipc-file".into(),
        });
      }
    }
    // Small JSON (accept/cancel/init/errors): return inline text — never base64 mesh.
    let json_text = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    return Ok(GeometryWorkerPostMeta {
      status,
      content_type,
      host_http_ms,
      host_read_ms: 0.0,
      byte_length: json_text.len(),
      frame_path: None,
      json_text: Some(json_text),
      delivery: "tauri-ipc-json".into(),
    });
  }

  // Inline binary CGF1 from worker → stage for raw IPC Response pull.
  let t_read = Instant::now();
  let dir = worker_temp_dir();
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let staged = dir.join(format!("ipc-{}.cgf1", uuid_like()));
  std::fs::write(&staged, &bytes).map_err(|e| e.to_string())?;
  let host_read_ms = t_read.elapsed().as_secs_f64() * 1000.0;
  Ok(GeometryWorkerPostMeta {
    status,
    content_type,
    host_http_ms,
    host_read_ms,
    byte_length: bytes.len(),
    frame_path: Some(staged.to_string_lossy().into_owned()),
    json_text: None,
    delivery: "tauri-ipc-binary".into(),
  })
}

/// Return staged CGF1 bytes as a raw IPC body (not JSON-encoded number arrays).
#[tauri::command]
fn geometry_frame_bytes(path: String) -> Result<Response, String> {
  let data = std::fs::read(&path).map_err(|e| format!("geometry_frame_bytes: {e}"))?;
  let _ = std::fs::remove_file(&path);
  Ok(Response::new(data))
}

fn uuid_like() -> String {
  use std::time::{SystemTime, UNIX_EPOCH};
  let nanos = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_nanos())
    .unwrap_or(0);
  format!("{nanos:x}")
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
    .invoke_handler(tauri::generate_handler![
      app_ready,
      geometry_worker_post,
      geometry_frame_bytes
    ])
    .run(tauri::generate_context!())
    .expect("error while running CAD Studio");
}
