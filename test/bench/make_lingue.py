#!/usr/bin/env python3
"""Scansioni di prova in quattro lingue (testi inventati), per il banco «OCR · lingue»:
inglese, francese, tedesco e spagnolo, con gli accenti e i segni propri di ciascuna lingua.
Ogni pagina è un'immagine (200 dpi, leggermente ruotata, con un po' di grana), come una scansione vera.
Scrive test/bench/tools/lingua-<codice>.pdf e lingue-attese.json. Uso: python3 test/bench/make_lingue.py"""
import json, pathlib, random, io
from PIL import Image, ImageDraw, ImageFont, ImageFilter
D = pathlib.Path(__file__).parent / 'tools'; D.mkdir(exist_ok=True)
TXT = {
 'eng': ["Dear Mr Thompson,", "Thank you for your letter of 14 March regarding the renewal of the service agreement.",
         "We are pleased to confirm that the new terms will apply from the first of June, with a monthly fee of 1,250 pounds.",
         "Our technicians will visit your offices in Manchester during the second week of May to check the equipment.",
         "Should you need any further information, please do not hesitate to contact our customer service.",
         "Yours sincerely, Margaret Wilson, Head of Sales"],
 'fra': ["Madame, Monsieur,", "Nous avons bien reçu votre demande du 3 février concernant la livraison des matériaux.",
         "Les pièces commandées seront expédiées à Lyon avant la fin du mois, après vérification de la qualité.",
         "Le montant total s'élève à 4 870 euros, frais de transport compris, payable à trente jours.",
         "Nous restons à votre entière disposition pour toute précision complémentaire.",
         "Veuillez agréer nos salutations distinguées. Hélène Lefèvre, responsable des achats"],
 'deu': ["Sehr geehrte Damen und Herren,", "vielen Dank für Ihre Anfrage vom 12. April bezüglich der Wartung unserer Anlagen.",
         "Die Prüfung der Heizungsanlage in München wird voraussichtlich drei Tage dauern und kostet 2.340 Euro.",
         "Bitte stellen Sie sicher, dass der Zugang zum Gebäude während der Arbeiten möglich ist.",
         "Für Rückfragen stehen wir Ihnen gerne zur Verfügung.",
         "Mit freundlichen Grüßen, Jürgen Schäfer, Geschäftsführer"],
 'spa': ["Estimado señor Martínez:", "Le agradecemos su solicitud del 21 de enero sobre la ampliación del contrato de mantenimiento.",
         "El técnico visitará la oficina de Sevilla el próximo miércoles por la mañana para revisar la instalación eléctrica.",
         "¿Podría confirmarnos la dirección exacta y el horario de acceso al edificio?",
         "El importe del servicio asciende a 960 euros, impuestos incluidos.",
         "Atentamente, Begoña Ruiz, departamento de atención al cliente"],
}
def font(sz):
    for f in ['/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf']:
        try: return ImageFont.truetype(f, sz)
        except OSError: pass
    return ImageFont.load_default()
random.seed(7)
exp = {}
for code, lines in TXT.items():
    W, H = 1654, 2339  # A4 a 200 dpi
    im = Image.new('L', (W, H), 255); d = ImageDraw.Draw(im); f = font(34); y = 220
    for para in lines:
        words, cur = para.split(), ''
        for w in words:
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=f) > W - 360: d.text((180, y), cur, font=f, fill=20); y += 52; cur = w
            else: cur = t
        d.text((180, y), cur, font=f, fill=20); y += 80
    im = im.rotate(0.6, resample=Image.BICUBIC, fillcolor=255).filter(ImageFilter.GaussianBlur(0.6))
    px = im.load()
    for _ in range(9000): px[random.randrange(W), random.randrange(H)] = random.choice([120, 200, 230])
    buf = io.BytesIO(); im.convert('RGB').save(D / f'lingua-{code}.pdf', 'PDF', resolution=200)
    exp[code] = '\n'.join(lines)
(D / 'lingue-attese.json').write_text(json.dumps(exp, ensure_ascii=False, indent=1), encoding='utf-8')
print('ok', sorted(exp))
