#!/bin/bash
sed -i 's/last_preview: Option<String>,/last_preview: Option<String>,\n    fps: u32,\n    quality: u32,\n    mesh_w: u32,\n    mesh_h: u32,/g' src/main.rs
