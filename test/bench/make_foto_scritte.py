#!/usr/bin/env python3
"""Foto (non fogli) con scritte piccole, tutto inventato: un'auto con la targa, una foto con una didascalia (nome e
telefono), una foto senza scritte. Per il banco «oscura · foto con scritte piccole». → test/bench/tools/foto-scritte.pdf"""
import io, random, pathlib, fitz
from PIL import Image, ImageDraw, ImageFont, ImageFilter
D = pathlib.Path(__file__).parent / 'tools'
F = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'; F2 = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
def photo(seed):
    r = random.Random(seed); im = Image.new('RGB', (3000, 2000)); d = ImageDraw.Draw(im)
    for y in range(2000): d.line([(0, y), (3000, y)], fill=(int(60 + 80 * y / 2000), int(90 + 60 * y / 2000), int(120 + 40 * y / 2000)))
    for _ in range(300):
        x, y = r.randint(0, 3000), r.randint(0, 2000); s = r.randint(20, 220); d.ellipse([x, y, x + s, y + s * 0.6], fill=(r.randint(30, 200), r.randint(30, 200), r.randint(30, 200)))
    im = im.filter(ImageFilter.GaussianBlur(3)); random.seed(seed)
    return Image.blend(im, Image.effect_noise((3000, 2000), 25).convert('RGB'), 0.15)
ims = []
im = photo(1); d = ImageDraw.Draw(im); d.rounded_rectangle([1800, 1500, 2160, 1580], 8, fill=(240, 240, 240), outline=(20, 20, 20), width=4)
d.text((1830, 1508), 'FA 123 BC', font=ImageFont.truetype(F, 58), fill=(10, 10, 10)); ims.append(im)
im = photo(2); d = ImageDraw.Draw(im); d.rectangle([2050, 1880, 2990, 1990], fill=(250, 250, 250))
d.text((2065, 1890), 'Mario Rossi', font=ImageFont.truetype(F2, 40), fill=(15, 15, 15)); d.text((2065, 1938), 'tel. 333 1234567', font=ImageFont.truetype(F2, 40), fill=(15, 15, 15)); ims.append(im)
ims.append(photo(3))
doc = fitz.open()
for im in ims:
    b = io.BytesIO(); im.save(b, 'JPEG', quality=90); pg = doc.new_page(width=842, height=595); pg.insert_image(pg.rect, stream=b.getvalue())
doc.save(str(D / 'foto-scritte.pdf')); print('ok')
