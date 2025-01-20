FROM python:3.10.12-slim

WORKDIR /app

COPY requirements.txt .

RUN apt update
RUN apt -y install uvicorn
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

RUN python -c "import torch; print(torch.__version__)"


COPY . .

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "back:app", "--host", "0.0.0.0", "--port", "8000"]