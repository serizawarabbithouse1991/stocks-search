use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

/// バックエンドプロセスの状態管理
struct BackendState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

/// FastAPIバックエンドのヘルスチェック
#[tauri::command]
async fn check_backend() -> Result<String, String> {
    let client = reqwest::Client::new();
    match client
        .get("http://127.0.0.1:8000/")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("Backend not available: {}", e)),
    }
}

/// バックエンドAPIへのプロキシ
#[tauri::command]
async fn proxy_api(path: String, method: String, body: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:8000{}", path);

    let request = match method.to_uppercase().as_str() {
        "POST" => {
            let mut req = client.post(&url);
            if let Some(b) = body {
                req = req.header("Content-Type", "application/json").body(b);
            }
            req
        }
        _ => client.get(&url),
    };

    match request.timeout(std::time::Duration::from_secs(60)).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("API error: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendState {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![check_backend, proxy_api])
        .setup(|app| {
            // アプリ起動時に Python バックエンドを起動
            let shell = app.shell();
            let cwd = std::env::current_dir().unwrap_or_default();

            // backend ディレクトリを探す (dev時とbuild時でパスが異なる)
            let backend_path = [
                cwd.join("backend"),                    // プロジェクトルートで npm run tauri dev 時
                cwd.join("..").join("backend"),          // カレントが src-tauri の時
                app.path()
                    .resource_dir()
                    .unwrap_or_default()
                    .join("..")
                    .join("..")
                    .join("..")
                    .join("..")
                    .join("backend"),                   // ビルド後の exe から (target/debug の4つ上)
            ]
            .into_iter()
            .find(|p| p.join("main.py").exists())
            .expect("backend/main.py not found (tried project root and src-tauri parent)");

            println!("[tauri] Starting backend from: {:?}", backend_path);

            let (mut rx, child) = shell
                .command("python")
                .args([
                    "-u",
                    backend_path.join("main.py").to_str().unwrap_or("main.py"),
                ])
                .current_dir(backend_path)
                .spawn()
                .expect("Failed to start Python backend");

            // バックエンドの stdout/stderr をログに出力
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(status) => {
                            println!("[backend] Process terminated: {:?}", status);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // プロセスを保持
            let state = app.state::<BackendState>();
            *state.child.lock().unwrap() = Some(child);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // ウィンドウ閉じ時にバックエンドを停止
                let state = window.state::<BackendState>();
                let mut guard = state.child.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                    println!("[tauri] Backend process killed");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
