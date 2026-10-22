"""Optional YOLO second-opinion service. Roboflow-compatible JSON, so the app needs only YOLO_API_URL.

Run:  pip install ultralytics fastapi uvicorn pillow
      YOLO_WEIGHTS=car-damage.pt uvicorn main:app --host 0.0.0.0 --port 9001
Then set YOLO_API_URL=https://<host>/detect in the app's secrets.
You must supply weights trained on car damage (e.g. a car-damage model exported from Roboflow Universe or your own).
"""
import base64, io, os
from fastapi import FastAPI, Request
from PIL import Image
from ultralytics import YOLO

model = YOLO(os.environ.get("YOLO_WEIGHTS", "car-damage.pt"))
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/detect")
async def detect(req: Request):
    img = Image.open(io.BytesIO(base64.b64decode(await req.body()))).convert("RGB")
    res = model.predict(img, conf=float(os.environ.get("YOLO_CONF", "0.25")), verbose=False)[0]
    preds = []
    for b in res.boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        preds.append({"x": (x1 + x2) / 2, "y": (y1 + y2) / 2, "width": x2 - x1, "height": y2 - y1,
                      "confidence": float(b.conf[0]), "class": res.names[int(b.cls[0])]})
    return {"image": {"width": img.width, "height": img.height}, "predictions": preds}
