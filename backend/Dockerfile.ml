FROM python:3.11-slim

WORKDIR /app

COPY ml_requirements.txt .

RUN pip install --no-cache-dir -r ml_requirements.txt

COPY ml_service.py .
COPY models ./models

EXPOSE 5001

CMD ["python", "ml_service.py"]