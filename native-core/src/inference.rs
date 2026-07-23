use ort::ep;
use ort::session::Session;
use ort::session::builder::GraphOptimizationLevel;
use ort::value::Tensor;
use std::path::Path;

use crate::postprocess;
use crate::DetectionBox;

pub const INPUT_SIZE: i32 = 640;

/// ONNX Runtime 推論セッション
pub struct OnnxInference {
    session: Session,
    conf_threshold: f64,
    iou_threshold: f64,
}

impl OnnxInference {
    /// モデルをロード（GPU利用可能ならDirectML/CoreMLで高速化）
    pub fn load(model_path: &Path) -> Result<Self, String> {
        let num_threads = std::thread::available_parallelism()
            .map(|n| n.get().saturating_sub(1).max(1))
            .unwrap_or(4);

        eprintln!("[inference] Loading model: {:?}", model_path);
        eprintln!("[inference] Using {} intra-op threads", num_threads);

        let builder = Session::builder()
            .map_err(|e| format!("Session builder: {}", e))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| format!("Optimization level: {}", e))?
            .with_intra_threads(num_threads)
            .map_err(|e| format!("Intra threads: {}", e))?;

        // GPU Execution Provider を登録（失敗時は自動でCPUフォールバック）
        let (ep_name, builder) = Self::with_gpu_provider(builder);
        eprintln!("[inference] Execution Provider: {}", ep_name);

        let mut session_builder = builder;
        let session = session_builder
            .commit_from_file(model_path)
            .map_err(|e| format!("Load model: {}", e))?;

        eprintln!("[inference] Model loaded successfully (EP: {})", ep_name);

        Ok(Self {
            session,
            conf_threshold: 0.30,
            iou_threshold: 0.45,
        })
    }

    /// プラットフォームに応じたGPU Execution Providerを登録
    /// EPが利用不可でもort内部で自動的にCPUフォールバックされる
    fn with_gpu_provider(builder: ort::session::builder::SessionBuilder) -> (String, ort::session::builder::SessionBuilder) {
        // Windows: DirectML（NVIDIA/AMD/Intel GPU対応、CUDAインストール不要）
        #[cfg(target_os = "windows")]
        {
            let dml = ep::DirectML::default()
                .with_performance_preference(ep::directml::PerformancePreference::HighPerformance)
                .build();
            match builder.with_execution_providers([dml]) {
                Ok(b) => return ("DirectML".to_string(), b),
                Err(e) => {
                    eprintln!("[inference] DirectML registration failed: {}", e);
                    // builder は消費済みなので新しく作り直す必要があるが、
                    // EP登録はerror_on_failure未設定時は基本的にErrにならない
                    unreachable!("DirectML EP registration should not fail without error_on_failure");
                }
            }
        }

        // macOS: CoreML（Apple Silicon / GPU / Neural Engine）
        #[cfg(target_vendor = "apple")]
        {
            let coreml = ep::CoreML::default()
                .with_compute_units(ep::coreml::ComputeUnits::All)
                .build();
            match builder.with_execution_providers([coreml]) {
                Ok(b) => return ("CoreML".to_string(), b),
                Err(e) => {
                    eprintln!("[inference] CoreML registration failed: {}", e);
                    unreachable!("CoreML EP registration should not fail without error_on_failure");
                }
            }
        }

        #[allow(unreachable_code)]
        ("CPU".to_string(), builder)
    }

    pub fn set_conf_threshold(&mut self, threshold: f64) {
        self.conf_threshold = threshold;
    }

    /// 推論実行
    /// input: NCHW float32 [3 * 640 * 640]
    pub fn run(&mut self, input_nchw: &[f32]) -> Result<(Vec<DetectionBox>, u64), String> {
        let start = std::time::Instant::now();

        let s = INPUT_SIZE as usize;
        if input_nchw.len() != 3 * s * s {
            return Err(format!(
                "Input size mismatch: got {}, expected {}",
                input_nchw.len(), 3 * s * s
            ));
        }

        // Tensor::from_array で [1, 3, 640, 640] テンソル作成
        let input_array = ndarray::Array4::from_shape_vec(
            (1, 3, s, s),
            input_nchw.to_vec(),
        ).map_err(|e| format!("Array shape: {}", e))?;

        let input_tensor = Tensor::from_array(input_array)
            .map_err(|e| format!("Tensor: {}", e))?;

        // 推論
        let outputs = self.session
            .run(ort::inputs![input_tensor])
            .map_err(|e| format!("Inference: {}", e))?;

        let inference_ms = start.elapsed().as_millis() as u64;

        // outputs[0] で最初の出力を取得、try_extract_tensor で (&Shape, &[f32])
        let (shape, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Extract output: {}", e))?;

        let output_shape: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
        eprintln!("[inference] Output: {:?}, {}ms", output_shape, inference_ms);

        let boxes = postprocess::process_output(
            data,
            &output_shape,
            self.conf_threshold,
            self.iou_threshold,
        );

        Ok((boxes, inference_ms))
    }
}
