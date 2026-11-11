#!/usr/bin/env python3
"""Surgically erase left-rear pedestal and picture frame while preserving the room."""
from pathlib import Path
import base64
import io
import subprocess
import numpy as np
import cv2
from PIL import Image
root=Path(__file__).resolve().parents[1]
path=root/'assets/backgrounds/memory-room.png'
original_blob=subprocess.check_output(['git','show','7f312c05eddc3462315b84d75bb36a9b1b566b7a:assets/backgrounds/memory-room.png'],cwd=root)
original=cv2.imdecode(np.frombuffer(original_blob,dtype=np.uint8),cv2.IMREAD_COLOR)
if original is None or original.shape[:2]!=(941,1672):
    raise SystemExit('Unexpected source memory-room.png size')
h,w=original.shape[:2]
# Review coordinates (640x360). Target includes framed picture, podium and its floor shadow.
# Sampling from a clean part of the same rear wall restores the exact tiles,
# skirting board, and floor lighting without replacing the rest of the room.
x0,x1=118,165
y0,y1=175,259
src_x0=178
sx=w/640
sy=h/360
def px(x):return round(x*sx)
def py(y):return round(y*sy)
a,b=px(x0),px(x1)
c,d=py(y0),py(y1)
source_a=px(src_x0)
source=original[c:d,source_a:source_a+b-a].astype(np.float32)
target=original[c:d,a:b].astype(np.float32)
if source.shape!=target.shape:raise SystemExit('Patch dimensions mismatch')
# Feathers only outside the occupied pixels; the frame/pedestal interior gets 100% clean tiles.
Y,X=np.mgrid[c:d,a:b]
left=np.clip((X-a)/max(1,px(124)-a),0,1)
right=np.clip((b-X)/max(1,b-px(160)),0,1)
top=np.clip((Y-c)/max(1,py(181)-c),0,1)
bottom=np.clip((d-Y)/max(1,d-py(255)),0,1)
alpha=(np.minimum.reduce([left,right,top,bottom]))[...,None]
result=original.copy()
result[c:d,a:b]=np.clip(alpha*source+(1-alpha)*target,0,255).astype(np.uint8)
if not cv2.imwrite(str(path),result,[cv2.IMWRITE_PNG_COMPRESSION,6]):
    raise SystemExit('Cannot save edited background')
print('ROOM_DECOR_REMOVED',path,'original',original.shape,'edited bounds',a,b,c,d)
print('EDITED_IMAGE_BEGIN')
im=Image.fromarray(cv2.cvtColor(result,cv2.COLOR_BGR2RGB))
im.thumbnail((640,360))
f=io.BytesIO();im.save(f,'JPEG',quality=55,optimize=True)
data=base64.b64encode(f.getvalue()).decode()
for i in range(0,len(data),400):print(data[i:i+400])
print('EDITED_IMAGE_END')
