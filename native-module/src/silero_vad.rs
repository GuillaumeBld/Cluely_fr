// Silero VAD v4 ONNX inference wrapper
// Model: silero_vad.onnx, input [1, 1, 512] float32, output [1, 1] float32 (speech probability)
// Falls back gracefully if model file not found.

use tract_onnx::prelude::*;
use ndarray::Array3;
use std::sync::Arc;

const MODEL_BYTES: &[u8] = include_bytes!("../models/silero_vad.onnx");
const SILERO_FRAME_SAMPLES: usize = 512; // 32ms at 16kHz
const SPEECH_THRESHOLD: f32 = 0.5;

type SileroModel = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

pub struct SileroVad {
    model: Option<Arc<SileroModel>>,
}

impl SileroVad {
    /// Attempt to load the embedded model. Returns a functional VAD or a fallback (None model).
    pub fn new() -> Self {
        match Self::load_model() {
            Ok(model) => {
                println!("[SileroVad] Model loaded OK");
                Self { model: Some(Arc::new(model)) }
            }
            Err(e) => {
                println!("[SileroVad] WARNING: model load failed ({}), falling back to RMS", e);
                Self { model: None }
            }
        }
    }

    fn load_model() -> TractResult<SileroModel> {
        let model = tract_onnx::onnx()
            .model_for_read(&mut std::io::Cursor::new(MODEL_BYTES))?
            .with_input_fact(0, InferenceFact::dt_shape(f32::datum_type(), tvec![1, 1, SILERO_FRAME_SAMPLES]))?
            .into_optimized()?
            .into_runnable()?;
        Ok(model)
    }

    /// Returns true if frame contains speech. `frame` must be i16 samples.
    /// Falls back to RMS > threshold if model not loaded.
    pub fn is_speech(&self, frame: &[i16]) -> bool {
        if let Some(model) = &self.model {
            self.infer(model, frame).unwrap_or_else(|e| {
                eprintln!("[SileroVad] Inference error: {}", e);
                Self::rms_fallback(frame)
            })
        } else {
            Self::rms_fallback(frame)
        }
    }

    fn infer(&self, model: &SileroModel, frame: &[i16]) -> TractResult<bool> {
        // Pad or trim to SILERO_FRAME_SAMPLES
        let len = frame.len().min(SILERO_FRAME_SAMPLES);
        let mut f32_buf = vec![0f32; SILERO_FRAME_SAMPLES];
        for (i, &s) in frame[..len].iter().enumerate() {
            f32_buf[i] = s as f32 / 32768.0;
        }
        let input = Array3::from_shape_vec((1, 1, SILERO_FRAME_SAMPLES), f32_buf)
            .map_err(|e| anyhow::anyhow!("{}", e))?;
        let input_tensor: Tensor = input.into();
        let result = model.run(tvec![input_tensor.into()])?;
        let prob = result[0].to_scalar::<f32>()?;
        Ok(*prob >= SPEECH_THRESHOLD)
    }

    fn rms_fallback(frame: &[i16]) -> bool {
        if frame.is_empty() { return false; }
        let sum: f64 = frame.iter().step_by(4).map(|&s| (s as f64) * (s as f64)).sum();
        let count = (frame.len() + 3) / 4;
        let rms = (sum / count as f64).sqrt() as f32;
        rms >= 100.0
    }

    pub fn is_loaded(&self) -> bool {
        self.model.is_some()
    }
}
