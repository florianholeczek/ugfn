FROM python:3.10.12-slim

WORKDIR /app

COPY ./requirements.txt .

# CPU-only torch (deployment machine has no GPU), no pip cache
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r ./requirements.txt \
 && python -c "import torch; print(torch.__version__)"

COPY ./back.py .
COPY ./python ./python
COPY ./front/public ./front/public


EXPOSE 8000

CMD ["python", "-m", "uvicorn", "back:app", "--host", "0.0.0.0", "--port", "8000"]
