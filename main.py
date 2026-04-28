import os
import io
import json
from base64 import b64encode
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="GrowthPoint App")

# Gemini 設定
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
else:
    print("WARNING: GEMINI_API_KEY is not set.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ヘルスチェック用エンドポイント
@app.get("/api/health")
async def health():
    return {"status": "ok", "gemini_enabled": GEMINI_API_KEY is not None}

# AI学習証明エンドポイント
@app.post("/api/verify-study")
async def verify_study(
    file: UploadFile = File(None),
    notes: str = Form(""),
    topic: str = Form("")
):
    if not GEMINI_API_KEY:
        return {
            "is_study_related": True,
            "confidence": 1.0,
            "summary": "AI設定が未完了のため、自動承認されました。",
            "reason": "Skip verification (No API Key)"
        }

    try:
        prompt = f"""
        この画像およびメモが、指定された学習トピック「{topic}」に関連する学習活動であるかを判定してください。
        
        メモ: {notes}
        
        判定基準:
        - 画像にノート、書籍、コード、スライド、ホワイトボードなどが写っているか。
        - 内容が学習トピックと矛盾していないか。
        
        結果は必ず以下の形式のJSONで返してください。余計な説明は不要です。
        {{
          "is_study_related": boolean,
          "confidence": number, (0-1.0)
          "summary": "学習内容の簡潔な要約（20文字以内）",
          "reason": "判定の理由"
        }}
        """

        contents = [prompt]
        if file:
            image_data = await file.read()
            contents.append({
                "mime_type": file.content_type,
                "data": image_data
            })

        response = model.generate_content(contents)
        
        # JSON部分の抽出
        text_response = response.text
        try:
            # Markdownのコードブロックを削除
            if "```json" in text_response:
                text_response = text_response.split("```json")[1].split("```")[0].strip()
            elif "```" in text_response:
                text_response = text_response.split("```")[1].split("```")[0].strip()
            
            result = json.loads(text_response)
            return result
        except Exception as e:
            print(f"JSON Parsing Error: {e}, Raw: {text_response}")
            return {
                "is_study_related": True,
                "confidence": 0.5,
                "summary": "分析を完了しました（要約取得失敗）",
                "reason": "Parsing error"
            }

    except Exception as e:
        print(f"Gemini API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 英単語生成エンドポイント
@app.post("/api/generate-vocab")
async def generate_vocab(word: str = Form(...)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")

    try:
        prompt = f"""
        You are a helpful English vocabulary teacher. 
        When given an English word, respond ONLY with valid JSON in this exact format:
        {{
          "word": "{word}",
          "meaning": "日本語での意味（1-2文）",
          "example": "Natural English example sentence using the word",
          "example_ja": "例文の日本語訳"
        }}
        
        Word: {word}
        """

        response = model.generate_content(prompt)
        text_response = response.text
        
        # JSON抽出ロジック
        if "```json" in text_response:
            text_response = text_response.split("```json")[1].split("```")[0].strip()
        elif "```" in text_response:
            text_response = text_response.split("```")[1].split("```")[0].strip()
        
        return json.loads(text_response)

    except Exception as e:
        print(f"Vocab Generation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 静的ファイル配信（フロントエンド）
# /static をマウントし、ルート (/) へのアクセスで index.html を表示
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
else:
    print(f"WARNING: Static directory not found at {static_dir}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
