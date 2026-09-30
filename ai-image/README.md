# 離線 AI 繪圖（ai-image）

只用**你裝置上的記憶體與顯示卡（GPU）**產生圖片的網頁。沒有伺服器、不上傳任何資料，
手機可用，安裝成 PWA 後**斷網也能開啟、也能生成**。

網址（GitHub Pages）：`https://kevylearn.github.io/LearnNote/ai-image/`

## 兩種引擎

| | 內建引擎（預設） | SD Turbo（進階） |
|---|---|---|
| 原理 | 每個像素在 GPU 上跑一個小型神經網路（CPPN + 傅立葉特徵），權重由「提示詞 + 種子」決定 | Stable Diffusion Turbo：CLIP 文字編碼 → UNet 一步去噪 → VAE 解碼 |
| 技術 | WebGL2 片段著色器 | ONNX Runtime Web + WebGPU |
| 需要下載 | 不用（整個網站約 1 MB） | 模型約 2.5 GB（下載或匯入一次） |
| 裝置 | 幾乎所有手機 / 電腦 | 建議記憶體 8 GB 以上、支援 WebGPU（新版 Chrome / Edge / Safari 26+） |
| 輸出 | 512～2048 px，任意比例 | 512 × 512 |
| 畫得出 | 風景、宇宙、萬花筒、流體、抽象等「生成藝術」 | 任何文字描述（貓、城堡、人物…） |

### 內建引擎怎麼理解提示詞？

`js/prompt.js` 內有一份中英文關鍵字表，會把描述轉成：

- **構圖**：山水風景（山、海、夕陽、森林…）、宇宙（星雲、行星…）、萬花筒（花、曼陀羅…）、大理石 / 流體、抽象
- **場景元素**：太陽、月亮、星星、極光、雲、霧、水面倒影、雪頂、樹林
- **配色**：夕陽、海洋、森林、秋天、霓虹…以及紅橙黃綠藍紫粉黑白等顏色詞
- **風格**：水彩、油畫、霓虹（合成波）、像素、素描、黑白、復古

沒辨識到的文字也不會浪費：整段描述會被雜湊成神經網路的權重，所以**同樣的描述 + 同樣的種子 = 同一張圖**，
換個字或換個種子就是新作品。

## 使用方式

1. 輸入描述（或點範例），按「生成」。
2. 「再一張」換隨機種子；「動態」讓網路權重在不同種子間平滑變形；「下載 / 分享」存圖。
3. 圖片自動存進「作品集」（瀏覽器的 IndexedDB，只存在這台裝置），點縮圖可「套用這組設定」重現。
4. 手機：Android Chrome 會出現「安裝到主畫面」；iPhone 請用 Safari「分享 → 加入主畫面」。
   安裝後即使飛航模式也能使用內建引擎。

### SD Turbo 模型

- 切到「SD Turbo」→「下載全部模型」，會從 Hugging Face 的
  [`schmuell/sd-turbo-ort-web`](https://huggingface.co/schmuell/sd-turbo-ort-web)（微軟 ONNX Runtime WebGPU 範例用的 fp16 版本）
  下載 `text_encoder`、`unet`、`vae_decoder` 三個 `model.onnx`，存在瀏覽器的 Cache Storage。
- 沒有網路的裝置：先在別處下載這三個檔案，再用每一列的「匯入檔案」逐一選取。
- 「進階」可以改模型網址（例如放在自己的伺服器上）。
- 第一次使用 SD Turbo 會從 jsDelivr 下載 ONNX Runtime Web（約 27 MB），Service Worker 會把它快取起來，之後離線可用。
  若要完全不依賴 CDN，把 `onnxruntime-web@1.30.0` 的 `dist/ort.webgpu.bundle.min.mjs` 與
  `dist/ort-wasm-simd-threaded.asyncify.wasm` 放到 `ai-image/vendor/onnxruntime-web/`，網站會優先使用。
- 中文描述會用內建字典翻成英文關鍵字（CLIP 只懂英文），用英文描述效果最好。

## 檔案結構

```
ai-image/
├── index.html            介面
├── css/app.css           樣式（手機優先、深色）
├── js/app.js             介面邏輯、作品集、PWA
├── js/neural-engine.js   內建引擎（WebGL2、分塊渲染、動態模式）
├── js/neural-shader.js   GPU 著色器：神經網路 + 構圖 + 風格
├── js/prompt.js          提示詞分析、配色、中翻英字典
├── js/rng.js             可重現的亂數
├── js/sd-engine.js       SD Turbo 推論流程（ONNX Runtime Web）
├── js/clip-tokenizer.js  CLIP BPE 分詞器
├── js/model-store.js     模型下載 / 匯入 / 儲存
├── js/gallery.js         作品集（IndexedDB）
├── assets/clip-merges.txt  CLIP 詞表（OpenAI CLIP，MIT 授權）
├── sw.js                 Service Worker（離線快取）
├── manifest.webmanifest  PWA 設定
└── icons/                圖示（用內建引擎畫的）
```

## 開發注意事項

- **修改任何檔案後，請把 `sw.js` 裡的 `VERSION` 加一**，否則已安裝的使用者會一直拿到舊的快取。
  新增檔案時也要加進 `sw.js` 的 `SHELL` 清單。
- Service Worker、WebGPU、Cache Storage 都需要 HTTPS（或 `localhost`）。本機測試：
  在專案根目錄執行 `npx http-server -c-1` 後開 `http://localhost:8080/ai-image/`。
- 內建引擎把大圖切成小塊、每塊都等 GPU 做完再繼續（WebGL2 fence），避免手機 GPU 逾時或畫面卡住。

## 已知限制

- 內建引擎不是擴散模型，畫不出「一隻貓」這類具體物件；它擅長風景、宇宙、圖騰與抽象藝術。
- SD Turbo 在一般手機上很可能因記憶體不足而失敗（瀏覽器分頁的記憶體上限通常遠小於手機實際記憶體）。
  可試「省記憶體模式」，或改用內建引擎。
- iOS 的瀏覽器若長時間未使用網站，可能清除本機資料；下載模型後瀏覽器會嘗試申請「持久儲存」。
