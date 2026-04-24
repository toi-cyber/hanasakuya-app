mod camera;
mod inference;
mod pipeline;
mod postprocess;
mod shared_memory_bridge;
mod video_pipeline;

use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};

use pipeline::Pipeline;
use video_pipeline::VideoPipeline;

/// UI → Core コマンド
#[derive(Deserialize, Debug)]
#[serde(tag = "cmd")]
enum Command {
    #[serde(rename = "start")]
    Start { device_id: i32 },
    #[serde(rename = "stop")]
    Stop,
    #[serde(rename = "list_cameras")]
    ListCameras,
    #[serde(rename = "set_threshold")]
    SetThreshold { value: f64 },
    #[serde(rename = "set_jpeg_quality")]
    SetJpegQuality { value: i32 },
    #[serde(rename = "set_display_resolution")]
    SetDisplayResolution { value: i32 },
    #[serde(rename = "process_video")]
    ProcessVideo { input_path: String, output_path: String, conf_threshold: f64 },
    #[serde(rename = "stop_video")]
    StopVideo,
    /// レンダラー側でキャプチャしたフレームをJPEG base64で受け取り推論
    #[serde(rename = "infer_frame")]
    InferFrame { jpeg_base64: String },
}

/// Core → UI イベント
#[derive(Serialize, Debug)]
#[serde(tag = "event")]
enum Event {
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "cameras")]
    Cameras { devices: Vec<CameraInfo> },
    #[serde(rename = "frame_ready")]
    FrameReady {
        shm_name: String,
        width: u32,
        height: u32,
    },
    #[serde(rename = "detection")]
    Detection {
        boxes: Vec<DetectionBox>,
        count: usize,
        inference_ms: u64,
        fps: f64,
        /// JPEG frame as base64 (display only)
        #[serde(skip_serializing_if = "Option::is_none")]
        frame_jpeg: Option<String>,
    },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "stopped")]
    Stopped,
    #[serde(rename = "video_progress")]
    VideoProgress { current_frame: u64, total_frames: u64 },
    #[serde(rename = "video_complete")]
    VideoComplete { output_path: String, total_frames: u64, elapsed_ms: u64 },
    #[serde(rename = "video_error")]
    VideoError { message: String },
    #[serde(rename = "video_cancelled")]
    VideoCancelled,
}

#[derive(Serialize, Debug)]
pub struct CameraInfo {
    pub id: i32,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct DetectionBox {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub confidence: f64,
}

fn send_event(event: &Event) {
    let json = serde_json::to_string(event).unwrap();
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", json);
    let _ = handle.flush();
}

fn main() {
    // コア準備完了を通知
    send_event(&Event::Ready);

    let mut current_pipeline: Option<Pipeline> = None;
    let mut current_video: Option<VideoPipeline> = None;
    let mut current_inference: Option<inference::OnnxInference> = None;
    let pipeline_settings = std::sync::Arc::new(pipeline::PipelineSettings::new());

    // モデルパスを特定（実行ファイルと同階層 or resources/）
    let model_path = find_model_path();
    eprintln!("[main] Model path: {:?}", model_path);

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let cmd: Command = match serde_json::from_str(&line) {
            Ok(c) => c,
            Err(e) => {
                send_event(&Event::Error {
                    message: format!("Invalid command: {}", e),
                });
                continue;
            }
        };

        match cmd {
            Command::ListCameras => {
                let devices = camera::list_cameras();
                send_event(&Event::Cameras { devices });
            }
            Command::Start { device_id } => {
                // 既存パイプラインを停止
                if let Some(p) = current_pipeline.take() {
                    p.stop();
                }

                match &model_path {
                    Some(path) => {
                        match Pipeline::start(device_id, path, pipeline_settings.clone()) {
                            Ok(p) => {
                                current_pipeline = Some(p);
                            }
                            Err(e) => {
                                send_event(&Event::Error { message: e });
                            }
                        }
                    }
                    None => {
                        send_event(&Event::Error {
                            message: "Model file not found".to_string(),
                        });
                    }
                }
            }
            Command::Stop => {
                if let Some(p) = current_pipeline.take() {
                    p.stop();
                }
            }
            Command::SetThreshold { value } => {
                pipeline_settings.conf_threshold_x100.store(
                    (value * 100.0) as i32,
                    std::sync::atomic::Ordering::Relaxed,
                );
            }
            Command::SetJpegQuality { value } => {
                pipeline_settings.jpeg_quality.store(value, std::sync::atomic::Ordering::Relaxed);
            }
            Command::SetDisplayResolution { value } => {
                pipeline_settings.display_resolution.store(value, std::sync::atomic::Ordering::Relaxed);
            }
            Command::ProcessVideo { input_path, output_path, conf_threshold } => {
                if let Some(v) = current_video.take() { v.stop(); }
                match &model_path {
                    Some(path) => {
                        match VideoPipeline::start(input_path, output_path, conf_threshold, path) {
                            Ok(v) => current_video = Some(v),
                            Err(e) => send_event(&Event::VideoError { message: e }),
                        }
                    }
                    None => send_event(&Event::VideoError { message: "Model file not found".to_string() }),
                }
            }
            Command::StopVideo => {
                if let Some(v) = current_video.take() { v.stop(); }
            }
            Command::InferFrame { jpeg_base64 } => {
                let path = match &model_path {
                    Some(p) => p.clone(),
                    None => {
                        send_event(&Event::Error { message: "Model file not found".to_string() });
                        continue;
                    }
                };
                // 初回のみモデルをロード（以降は使い回す）
                if current_inference.is_none() {
                    eprintln!("[main] Loading inference engine for renderer-driven mode...");
                    match inference::OnnxInference::load(std::path::Path::new(&path)) {
                        Ok(inf) => {
                            eprintln!("[main] Inference engine ready");
                            current_inference = Some(inf);
                        }
                        Err(e) => {
                            send_event(&Event::Error { message: format!("Model load failed: {}", e) });
                            continue;
                        }
                    }
                }
                if let Some(inf) = &mut current_inference {
                    let conf = pipeline_settings.conf_threshold_x100.load(std::sync::atomic::Ordering::Relaxed) as f64 / 100.0;
                    inf.set_conf_threshold(conf);
                    match infer_jpeg_frame(&jpeg_base64, inf) {
                        Ok((boxes, inference_ms)) => {
                            let count = boxes.len();
                            send_event(&Event::Detection {
                                boxes,
                                count,
                                inference_ms,
                                fps: 0.0, // FPS はレンダラー側で計算
                                frame_jpeg: None,
                            });
                        }
                        Err(e) => send_event(&Event::Error { message: e }),
                    }
                }
            }
        }
    }
}

/// レンダラーから受け取った JPEG base64 フレームを推論
fn infer_jpeg_frame(
    jpeg_base64: &str,
    inference: &mut inference::OnnxInference,
) -> Result<(Vec<DetectionBox>, u64), String> {
    use base64::Engine;
    use opencv::{core::Vector, imgcodecs};

    let jpeg_bytes = base64::engine::general_purpose::STANDARD
        .decode(jpeg_base64)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    let buf = Vector::from_slice(&jpeg_bytes);
    let frame = imgcodecs::imdecode(&buf, imgcodecs::IMREAD_COLOR)
        .map_err(|e| format!("JPEG decode failed: {}", e))?;

    if frame.empty() {
        return Err("Decoded frame is empty".to_string());
    }

    let input = camera::CameraCapture::preprocess_for_inference(&frame, inference::INPUT_SIZE)?;
    inference.run(&input)
}

/// ONNXモデルファイルを探す
fn find_model_path() -> Option<String> {
    let candidates = [
        // 開発時: リポジトリルートからの相対パス
        "resources/models/yolov8n_oocyte.onnx",
        "../resources/models/yolov8n_oocyte.onnx",
        // TFLite変換時に生成されたONNX
        "../../LocalLearning/oocyte_detection_yolo/scripts/runs/models/oocyte_v2_mixed/weights/best.onnx",
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // 実行ファイルと同じディレクトリ
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let model = dir.join("yolov8n_oocyte.onnx");
            if model.exists() {
                return Some(model.to_string_lossy().to_string());
            }
        }
    }

    None
}
