import cv2
import numpy as np
import os

h, w = 200, 200
fps = 30
output_path = "test_codec.webm"
fourcc = cv2.VideoWriter_fourcc(*'VP80')
out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

if not out.isOpened():
    print("Failed to open VP80 webm")
    out.release()
    output_path = "test_codec.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
    if not out.isOpened():
        print("Failed to open avc1 mp4")
    else:
        print("Opened avc1 mp4")
else:
    print("Opened VP80 webm")

frame = np.zeros((h, w, 3), dtype=np.uint8)
out.write(frame)
out.release()

if os.path.exists(output_path):
    print("Success! File size:", os.path.getsize(output_path))
