use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use base64::Engine;
use crate::camera::CameraCapture;
use crate::inference::{OnnxInference, INPUT_SIZE};
use crate::{send_event, Event};

/// ランタイム設定（Atomic で安全に変更可能）
pub struct PipelineSettings {
    pub jpeg_quality: AtomicI32,
    pub display_resolution: AtomicI32,
    pub conf_threshold_x100: AtomicI32, // 0.30 → 30
}

impl PipelineSettings {
    pub fn new() -> Self {
        Self {
            jpeg_quality: AtomicI32::new(60),
            display_resolution: AtomicI32::new(960),
            conf_threshold_x100: AtomicI32::new(30),
        }
    }
}

pub struct Pipeline {
    running: Arc<AtomicBool>,
    pub settings: Arc<PipelineSettings>,
}

impl Pipeline {
    pub fn start(
        device_id: i32,
        model_path: &str,
        settings: Arc<PipelineSettings>,
    ) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let settings_clone = settings.clone();
        let model_path = model_path.to_string();

        thread::spawn(move || {
            if let Err(e) = run_pipeline(device_id, &model_path, &running_clone, &settings_clone) {
                send_event(&Event::Error { message: e });
            }
            send_event(&Event::Stopped);
        });

        Ok(Self { running, settings })
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

fn run_pipeline(
    device_id: i32,
    model_path: &str,
    running: &AtomicBool,
    settings: &PipelineSettings,
) -> Result<(), String> {
    let mut camera = CameraCapture::open(device_id)?;
    let width = camera.width();
    let height = camera.height();

    send_event(&Event::FrameReady {
        shm_name: String::new(),
        width,
        height,
    });

    let mut inference = OnnxInference::load(std::path::Path::new(model_path))?;

    let mut fps_counter = FpsCounter::new();

    while running.load(Ordering::Relaxed) {
        // 設定を読み取り
        let jpeg_quality = settings.jpeg_quality.load(Ordering::Relaxed);
        let display_res = settings.display_resolution.load(Ordering::Relaxed);
        let conf_thresh = settings.conf_threshold_x100.load(Ordering::Relaxed) as f64 / 100.0;

        // 閾値を推論エンジンに反映
        inference.set_conf_threshold(conf_thresh);

        let frame = match camera.read_frame() {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[pipeline] Frame read error: {}", e);
                continue;
            }
        };

        let frame_jpeg = CameraCapture::bgr_to_jpeg(&frame, display_res, jpeg_quality)
            .ok()
            .map(|jpeg| base64::engine::general_purpose::STANDARD.encode(&jpeg));

        let input = match CameraCapture::preprocess_for_inference(&frame, INPUT_SIZE) {
            Ok(data) => data,
            Err(e) => {
                eprintln!("[pipeline] Preprocess error: {}", e);
                continue;
            }
        };

        match inference.run(&input) {
            Ok((boxes, inference_ms)) => {
                let fps = fps_counter.tick();
                let count = boxes.len();

                send_event(&Event::Detection {
                    boxes,
                    count,
                    inference_ms,
                    fps,
                    frame_jpeg,
                });
            }
            Err(e) => {
                eprintln!("[pipeline] Inference error: {}", e);
            }
        }
    }

    Ok(())
}

struct FpsCounter {
    last_time: Instant,
    frame_count: u32,
    current_fps: f64,
}

impl FpsCounter {
    fn new() -> Self {
        Self {
            last_time: Instant::now(),
            frame_count: 0,
            current_fps: 0.0,
        }
    }

    fn tick(&mut self) -> f64 {
        self.frame_count += 1;
        let elapsed = self.last_time.elapsed().as_secs_f64();
        if elapsed >= 1.0 {
            self.current_fps = self.frame_count as f64 / elapsed;
            self.frame_count = 0;
            self.last_time = Instant::now();
        }
        self.current_fps
    }
}
