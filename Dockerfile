FROM python:3.12-slim

WORKDIR /app

# 依存関係のコピーとインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ファイルのコピー
# main.py と static/ ディレクトリをコピー
COPY main.py .
COPY static/ static/

# Cloud Run 用のポート設定
EXPOSE 8080

# サーバー起動
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
