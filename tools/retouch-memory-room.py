#!/usr/bin/env python3
"""Remove just the left-rear pedestal and small framed object from memory room."""
from pathlib import Path
import base64
import io
import numpy as np
import cv2
from PIL import Image

root = Path(__file__).resolve().parents[1]
path = root / "assets/backgrounds/memory-room.png"
image = cv2.imread(str(path), cv2.IMREAD_COLOR)
if image is None:
    raise SystemExit("Memory room background not found")
h, w = image.shape[:2]
if (w, h) != (1672, 941):
    raise SystemExit(f"Unexpected memory room dimensions: {w}x{h}")
# Mask tightly hugs the pedestal and the small framed item placed on top.
# Coordinates are stored in 640x360 review-preview space to simplify auditing.
preview_outline = np.array([
    [132,178], [152,178], [157,200], [161,201],
    [161,253], [122,253], [122,200], [132,197]
], dtype=np.float32)
preview_outline[:,0] *= w / 640
preview_outline[:,1] *= h / 360
mask = np.zeros((h,w),dtype=np.uint8)
cv2.fillPoly(mask,[preview_outline.astype(np.int32)],255)
# Telea inpainting reconstructs the rear wall/baseboard and small floor area
# from surrounding pixels, leaving all untouched pixels exactly unchanged.
result = cv2.inpaint(image,mask,10,cv2.INPAINT_TELEA)
assert np.array_equal(result[mask==0],image[mask==0])
if not cv2.imwrite(str(path),result,[cv2.IMWRITE_PNG_COMPRESSION,6]):
    raise SystemExit("Could not write repaired image")
print(f"Updated {path.relative_to(root)}; {w}x{h}; masked pixels={np.count_nonzero(mask)}")
def preview(tag,img):
    im=Image.fromarray(cv2.cvtColor(img,cv2.COLOR_BGR2RGB))
    im.thumbnail((640,360))
    b=io.BytesIO();im.save(b,format="JPEG",quality=55,optimize=True)
    print(f"{tag}_IMAGE_BEGIN")
    encoded=base64.b64encode(b.getvalue()).decode("ascii")
    for i in range(0,len(encoded),400):print(encoded[i:i+400])
    print(f"{tag}_IMAGE_END")
preview("REPAIRED",result)
