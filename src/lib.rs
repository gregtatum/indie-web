use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    return a + b;
}

macro_rules! console_log {
    ($($t:tt)*) => {
        {
            web_sys::console::log_1(&format!($($t)*).into())
        }
    }
}

#[wasm_bindgen]
pub fn greet(name: &str) {
    console_log!("Greetings from wasm: {}!", name);
}
