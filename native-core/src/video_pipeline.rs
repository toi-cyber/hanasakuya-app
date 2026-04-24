use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use opencv::prelude::*;
use opencv::videoio;
use opencv::imgproc;
use opencv::core as cv_core;

use crate::camera::CameraCapture;
use crate::inference::{OnnxInference, INPUT_SIZE};
use crate::{send_event, Event};

pub struct VideoPipeline {
    running: Arc<AtomicBool>,
}

impl VideoPipeline {
    pub fn start(
        input_path: String,
        output_path: String,
        conf_threshold: f64,
        model_path: &str,
    ) -> Result<Self, String> {
        // OnnxInference をメインスレッドでロード（workerスレッド内でのCOM初期化問題を回避）
        eprintln!("[video] Loading inference engine in main thread...");
        let mut inference = OnnxInference::load(std::path::Path::new(model_path))
            .map_err(|e| format!("Model load failed: {}", e))?;
        inference.set_conf_threshold(conf_threshold);
        eprintln!("[video] Inference engine ready, spawning worker thread");

        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        thread::spawn(move || {
            if let Err(e) = run_video_pipeline(&input_path, &output_path, inference, &running_clone) {
                send_event(&Event::VideoError { message: e });
            }
        });

        Ok(Self { running })
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

fn run_video_pipeline(
    input_path: &str,
    output_path: &str,
    mut inference: OnnxInference,
    running: &AtomicBool,
) -> Result<(), String> {
    eprintln!("[video] Opening input: {}", input_path);

    let mut cap = open_video_capture(input_path)?;

    let fps_raw = cap.get(videoio::CAP_PROP_FPS).unwrap_or(0.0);
    let fps = if fps_raw > 0.0 { fps_raw } else { 30.0 };
    let width = cap.get(videoio::CAP_PROP_FRAME_WIDTH).unwrap_or(640.0) as i32;
    let height = cap.get(videoio::CAP_PROP_FRAME_HEIGHT).unwrap_or(480.0) as i32;
    let total_frames = cap.get(videoio::CAP_PROP_FRAME_COUNT).unwrap_or(0.0).max(0.0) as u64;

    eprintln!("[video] Input: {}x{} @ {:.1}fps, {} frames", width, height, fps, total_frames);

    // 出力VideoWriterを開く
    let frame_size = cv_core::Size::new(width, height);
    let (mut writer, actual_output_path) = open_video_writer(output_path, fps, frame_size)?;

    eprintln!("[video] Starting frame loop");
    let start_time = Instant::now();
    let mut frame_num: u64 = 0;

    loop {
        if !running.load(Ordering::Relaxed) {
            send_event(&Event::VideoCancelled);
            return Ok(());
        }

        let mut frame = Mat::default();
        let ok = cap.read(&mut frame).unwrap_or(false);
        if !ok || frame.empty() {
            eprintln!("[video] End of video at frame {}", frame_num);
            break;
        }

        if frame_num == 0 {
            eprintln!("[video] First frame read OK");
        }

        let input = CameraCapture::preprocess_for_inference(&frame, INPUT_SIZE)
            .unwrap_or_default();

        let boxes = if !input.is_empty() {
            inference.run(&input).map(|(b, _)| b).unwrap_or_default()
        } else {
            vec![]
        };

        // bboxをフレームに描画
        let mut annotated = frame.clone();
        for b in &boxes {
            let x1 = (b.x1 * width as f64) as i32;
            let y1 = (b.y1 * height as f64) as i32;
            let x2 = (b.x2 * width as f64) as i32;
            let y2 = (b.y2 * height as f64) as i32;
            let rect = cv_core::Rect::new(x1, y1, (x2 - x1).max(1), (y2 - y1).max(1));
            let color = cv_core::Scalar::new(0.0, 255.0, 0.0, 255.0);
            imgproc::rectangle(&mut annotated, rect, color, 2, imgproc::LINE_8, 0).ok();
            let label = format!("{:.0}%", b.confidence * 100.0);
            imgproc::put_text(
                &mut annotated,
                &label,
                cv_core::Point::new(x1, (y1 - 6).max(0)),
                imgproc::FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
                imgproc::LINE_8,
                false,
            ).ok();
        }

        writer.write(&annotated).map_err(|e| format!("Write frame failed: {}", e))?;
        frame_num += 1;

        if frame_num % 10 == 0 {
            send_event(&Event::VideoProgress {
                current_frame: frame_num,
                total_frames,
            });
        }
    }

    let elapsed_ms = start_time.elapsed().as_millis() as u64;
    send_event(&Event::VideoComplete {
        output_path: actual_output_path,
        total_frames: frame_num,
        elapsed_ms,
    });

    Ok(())
}

fn open_video_capture(input_path: &str) -> Result<videoio::VideoCapture, String> {
    // Windows: FFMPEG を優先（ファイル読み込みに最適・MSMF はハングの原因になる）
    // macOS/Linux: CAP_ANY
    #[cfg(target_os = "windows")]
    let backends = &[
        ("FFMPEG", videoio::CAP_FFMPEG),
        ("ANY",    videoio::CAP_ANY),
    ];
    #[cfg(not(target_os = "windows"))]
    let backends = &[
        ("ANY", videoio::CAP_ANY),
    ];

    for (name, backend) in backends.iter() {
        eprintln!("[video] Trying backend {} for: {}", name, input_path);
        match videoio::VideoCapture::from_file(input_path, *backend) {
            Ok(cap) if cap.is_opened().unwrap_or(false) => {
                eprintln!("[video] Opened with backend {}", name);
                return Ok(cap);
            }
            Ok(_) => eprintln!("[video] Backend {} opened but not ready", name),
            Err(e) => eprintln!("[video] Backend {} error: {}", name, e),
        }
    }

    Err(format!("Cannot open video file: {}", input_path))
}

fn open_video_writer(
    output_path: &str,
    fps: f64,
    frame_size: cv_core::Size,
) -> Result<(videoio::VideoWriter, String), String> {
    eprintln!("[video] Opening writer: {} ({}x{} @ {:.1}fps)", output_path, frame_size.width, frame_size.height, fps);

    #[cfg(target_os = "windows")]
    {
        let avi_path = {
            let p = std::path::Path::new(output_path);
            p.with_extension("avi").to_string_lossy().to_string()
        };

        // MJPG を先に試す（外部コーデック不要・COM 初期化不要）
        let fourcc_mjpg = videoio::VideoWriter::fourcc('M', 'J', 'P', 'G').unwrap_or(-1);
        eprintln!("[video] Windows: trying MJPG -> {}", avi_path);
        match videoio::VideoWriter::new(&avi_path, fourcc_mjpg, fps, frame_size, true) {
            Ok(w) if w.is_opened().unwrap_or(false) => {
                eprintln!("[video] Writer opened with MJPG");
                return Ok((w, avi_path));
            }
            _ => eprintln!("[video] MJPG failed"),
        }

        // XVID にフォールバック
        let fourcc_xvid = videoio::VideoWriter::fourcc('X', 'V', 'I', 'D').unwrap_or(-1);
        eprintln!("[video] Windows: trying XVID -> {}", avi_path);
        match videoio::VideoWriter::new(&avi_path, fourcc_xvid, fps, frame_size, true) {
            Ok(w) if w.is_opened().unwrap_or(false) => {
                eprintln!("[video] Writer opened with XVID");
                return Ok((w, avi_path));
            }
            _ => eprintln!("[video] XVID failed"),
        }

        return Err(format!("Failed to open video writer: {}", avi_path));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let codecs: &[(&str, i32)] = &[
            ("mp4v", videoio::VideoWriter::fourcc('m', 'p', '4', 'v').unwrap_or(-1)),
            ("avc1", videoio::VideoWriter::fourcc('a', 'v', 'c', '1').unwrap_or(-1)),
        ];
        for (name, fourcc) in codecs {
            if *fourcc < 0 { continue; }
            match videoio::VideoWriter::new(output_path, *fourcc, fps, frame_size, true) {
                Ok(w) if w.is_opened().unwrap_or(false) => {
                    eprintln!("[video] Writer opened with codec: {}", name);
                    return Ok((w, output_path.to_string()));
                }
                _ => eprintln!("[video] Codec {} failed, trying next", name),
            }
        }
        Err(format!("Failed to open video writer for: {}", output_path))
    }
}
